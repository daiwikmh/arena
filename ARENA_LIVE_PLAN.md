# Arena Live — voice-directed camera effects

**A new mode on top of the existing Arena engine.** Point a phone camera at yourself, talk to it continuously, and when you ask for an effect ("give me a fireball," "make it blue," "turn it into lightning"), it appears. Budget and latency are not constraints — the user has said so explicitly. The only question this plan answers is: **is it possible, and what's the real architecture**, not "what's the cheapest MVP."

> Builds on `ARENA_PLAN.md`'s engine (NB2 Lite image generation, the content-addressed `Draft` cache, the `object_refs` conditioning path fixed this session) for the actual pixel synthesis. What's new here is the *live* layer sitting in front of it — the **Gemini Live API** — which this plan verified is real and already installed, not assumed from docs.

---

## 1. The architecture is real, and it's Google's own reference pattern

Earlier drafts of this plan proposed a manual loop: capture a frame, REST-upload it, poll for a generated image, repeat per typed/spoken command. That's a workaround. It works, but it isn't "live" — it's a chat box with a camera bolted on.

The actual live layer is the **Gemini Live API** — a stateful, bidirectional WebSocket session that streams continuous audio and video *into* Gemini and gets native audio + tool calls *out*, in real time, no polling. Google's own published pattern for this exact use case is called **GenMedia Live**: Live API (voice + camera) + an image model (Nano Banana Pro) + Veo, "show your camera or share your screen to ask questions about what you see," image generation triggered conversationally. This isn't a hypothetical — it's a shipped Google reference architecture from their own developer blog.

### Verified against the SDK actually installed in this repo (`google-genai==2.10.0`), not just docs

Same discipline `ARENA_PLAN.md` used for `client.interactions.create()` — introspected the real installed package rather than trusting marketing copy:

```
>>> hasattr(client, 'live')
False
>>> hasattr(client.aio, 'live')
True
>>> client.aio.live.connect
(*, model: str, config: LiveConnectConfig | LiveConnectConfigDict | None = None) -> AsyncIterator[AsyncSession]
```

**It's real, it's async-only (`client.aio.live`, matching the pattern `generate_clip()` already uses for the Interactions API), and it's on the exact SDK version this repo has installed.** No upgrade needed.

`LiveConnectConfig` (confirmed via `model_fields`, not guessed) has everything the architecture needs:

| Field | Use here |
|---|---|
| `tools: list[Tool \| Callable]` | Register `apply_effect(description)` as a real function the model can call mid-conversation |
| `system_instruction` | "You're watching a live camera feed. When the user asks for a visual effect or a change to one, call `apply_effect`." |
| `response_modalities` | `AUDIO` — Gemini talks back natively, no separate TTS needed |
| `input_audio_transcription` / `output_audio_transcription` | Free transcript for the UI, no separate ASR |
| `realtime_input_config` | Controls voice-activity detection / turn-taking behavior |

`AsyncSession` (confirmed via `dir()` + signatures) has exactly the methods this needs:

```python
await session.send_realtime_input(video=Blob(...), audio=Blob(...))   # stream camera + mic continuously
await session.send_tool_response(function_responses=[...])            # answer a tool call
async for message in session.receive():                               # tool_call, server_content (audio), transcripts
    ...
```

`LiveServerMessage.tool_call.function_calls` is a real, typed field — when the model decides "the user wants a fireball," it shows up here as a structured function call, not something we have to parse out of a text response.

---

## 2. What "live" actually means here — and its one hard limit

Confirmed from current docs: **video streamed into the Live API is processed at 1 frame per second.** That's a server-side constraint, not a bandwidth choice we control. It means Gemini's live visual grounding updates once a second — fine for "point the camera at your hand and describe what you want," not fine for tracking fast motion.

That 1fps ceiling is *exactly* why this is the right architecture for what was asked, and exactly why it's not "the fireball visually tracks your hand at 30fps like a Snapchat lens": Gemini's own live vision is already capped at conversational speed, not motion-tracking speed. The generation step (NB2 Lite, ~4.5s measured in `ARENA_PLAN.md`) is slower than that 1fps cap anyway, so the 1fps limit isn't even the bottleneck — the image synthesis is. Since latency isn't a constraint here, that's fine: the experience is "ask, wait a few seconds, see it," repeatedly, for as long as the conversation runs.

**Session limit:** 10 minutes by default per Live session, with a `session_resumption` config available to extend/reconnect — worth using so a long back-and-forth doesn't just die mid-conversation.

---

## 3. End-to-end flow

```
Browser                          Backend (new WS relay)              Existing Arena engine
────────                          ──────────────────────              ─────────────────────
getUserMedia (camera+mic)
  │
  ├─ every ~1s: canvas snapshot ──►  relay into session.send_realtime_input(video=...)
  ├─ continuous: mic audio     ──►  relay into session.send_realtime_input(audio=...)
                                          │
                                   client.aio.live.connect(
                                     model=<live model>,
                                     config=LiveConnectConfig(
                                       tools=[apply_effect],
                                       system_instruction=...,
                                       response_modalities=[AUDIO],
                                     ),
                                   )
                                          │
                              Gemini hears "give me a fireball,"
                              sees the last ~1s-old frame, decides
                              to call apply_effect(description="fireball
                              in the user's open palm")
                                          │
                                   tool_call arrives via session.receive()
                                          │
                                   grab most-recent buffered frame ──► generate_image(
                                                                          prompt=description,
                                                                          refs=[that frame],   # existing _resolve_refs path
                                                                          role="scene",
                                                                        )
                                          │
                                   session.send_tool_response(...)   (Gemini can now voice-confirm)
◄── generated image pushed over the same WS (side-channel, not through Gemini)
◄── Gemini's spoken confirmation (native audio out)
display generated image, replacing/overlaying the camera view
```

Follow-ups ("make it blue") are the **same tool call again** — Gemini decides from ongoing conversation that this is a modification, not a new effect, and the backend uses the *last generated image* (not a fresh camera frame) as the `object_ref`, chaining exactly like the existing `Shot` edit-turn model already does.

---

## 4. New parts

| Part | Choice | Why |
|---|---|---|
| Backend WS relay | New FastAPI WebSocket endpoint, e.g. `/live/{project_id}/session` | Browser can't hold the Gemini API key; this endpoint owns the `client.aio.live.connect()` session and relays frames/audio in, tool calls + generated images out |
| `apply_effect` tool | A `Tool`/function declaration registered in `LiveConnectConfig.tools`, handled server-side when it fires | This is what turns "watching and listening" into "generating something" — the actual trigger, decided by Gemini's own reasoning over the live conversation, not a keyword regex |
| Frame buffering | Backend keeps the most recent ~1s-old frame (and the most recent *generated* result) in memory per session | Needed at tool-call time to know what to condition the generation on |
| Image synthesis | Existing `generate_image(role="scene", refs=[...])` — **zero new backend generation code**, this is the exact path fixed this session | Reuse, not rebuild |
| Camera + mic capture | `getUserMedia({video, audio})`, canvas snapshot every ~1s (matches the server's own processing rate — no point sending faster), `MediaRecorder`/`AudioWorklet` for the mic stream | Browser-native, no new dependency |
| Result channel | Generated images pushed to the browser over the same WebSocket as a side-channel message type, separate from the Gemini audio/tool-call stream | Keeps one connection, one mental model |
| **Multi-device pairing** | One Gemini Live session per `project_id`, held server-side; multiple browser WS connections can attach to the *same* session with a `role` (`camera` or `control`) | Phone points its camera and joins as `camera` (streams video only); laptop joins as `control` (sends audio/text, receives generated results and Gemini's replies to display). The backend relays whichever role sends what into the one shared Gemini session — Gemini itself doesn't know or care that two devices are involved |

**Not needed anymore, now that this is Live-API-based rather than the manual-loop version:** browser `SpeechRecognition` (Gemini's own audio understanding replaces it — and it's multilingual and handles barge-in, which a browser ASR wouldn't), the regex intent-parser (Gemini's own reasoning decides when to call the tool).

---

## 5. What's unverified, and the gate to run before writing the frontend

Introspecting the SDK proves the *shape* is real. It does not prove:

**Gate J — does the Live API actually call `apply_effect` reliably when a user asks for a visual effect, without over-triggering on normal conversation?**
Open a real session, register the tool, talk to it: say things that should trigger it ("give me a fireball," "make it blue," "turn it into lightning") and things that shouldn't ("what do you see," "hang on a sec"). Check: does the tool fire on the right utterances and stay quiet on the others? This is the load-bearing gate — if triggering is unreliable, the whole "just talk to it" framing breaks and needs an explicit "listening for a command" push-to-talk fallback instead.

**Also unverified, lower stakes, resolve during Gate J rather than guessing now:**
- Exact model ID for the Live API — the search results reference `gemini-2.5-flash-native-audio` but this repo's `MODEL_ROUTING` (`engine/models.py`) doesn't have a live-capable entry yet. Confirm the right model string against the real API (`client.models.list()` or the connect call's own error message if wrong) rather than hardcoding a guess.
- Whether `Blob` video frames sent via `send_realtime_input` need a specific encoding/format (JPEG bytes vs. raw) — check against the first real `send_realtime_input(video=...)` call, not the type signature alone.
- Same open question `ARENA_PLAN.md` §3 already flagged for shots, inherited here: does reference-conditioned re-generation (feeding the last generated frame back in as `object_ref` for "make it blue") preserve identity across turns, or drift? Still unproven, still worth checking in the same pass as Gate J since both need a real session running anyway.

---

## 6. Phases

**Phase 0 — Gate J.** One real script: connect to the Live API, register `apply_effect` as a no-op logger (print the call, don't generate anything yet), talk to it for a couple minutes, see what triggers and what doesn't. Cheapest possible test of the riskiest assumption.

**Phase 1 — wire the tool call to real generation.** Same session, but `apply_effect` now actually calls `generate_image` with the most recent buffered frame as reference and returns/displays the result. Still a throwaway script or a minimal page, not the full UI — proves the whole loop end-to-end once.

**Phase 2 — backend WS relay + frontend camera/mic capture.** Build the actual `/live/{project_id}/session` FastAPI endpoint and the browser-side capture/relay. This is where the app UI (new `/live` page) gets built for real.

**Phase 3 — chained follow-ups + display polish.** "Make it blue" reliably targeting the last result, not a fresh capture; visible "listening" / "generating" states; session-resumption handling for the 10-minute cap.

**Phase 4 (optional) — spatial anchoring.** Only worth it once Gate J + the reference-chaining question both land clean (Gate J passed — see §8). Broken into the actual sub-systems, in the order they'd get built:

| Sub-system | What it is | Library | Depends on |
|---|---|---|---|
| **Hand tracking** | Palm/finger keypoints, feeds effect placement into the generation prompt ("centered on the open palm at frame position X,Y") | MediaPipe Hands (on-device WASM) | Nothing — can start independently |
| **Body tracking** | Full-pose keypoints, for effects anchored to torso/limbs rather than just a hand | MediaPipe Pose | Nothing — can start independently |
| **World tracking** | Anchoring an effect to a fixed point *in the room* rather than on the body, so it stays put as the camera moves | WebXR Device API (`immersive-ar` session) where supported; this is the one genuinely hard/uncertain piece — mobile browser WebXR support is inconsistent, would need testing per-device before committing to it | Camera pose tracking, which WebXR provides but the browser has to support |
| **AI graph** | A node-graph of effect logic (trigger → generation params → compositing → output) instead of one hardcoded `apply_effect` path, so new effect types compose instead of each needing bespoke code | Not a library — this is an internal design once there's more than one effect *kind* (e.g. once compositing isn't always "whole-frame regenerate") | Enough real usage to know what actually varies between effects |
| **Real-time rendering** | Compositing the generated effect back over live video *continuously* between generation calls, instead of a static image freeze each turn | Canvas 2D/WebGL layer blending the last generated result over the live feed with masking | The generation output itself — nothing to composite until Phase 1-3 produce real images |

None of these block the core loop. Hand/body tracking are the cheapest to try first (pure client-side, no new backend). World tracking is the one to prove out early if it's wanted, since WebXR AR support varies enough by device that it could rule out the approach entirely rather than just needing tuning.

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Gate J fails — tool-calling doesn't trigger reliably from natural conversation** | "Just talk to it" doesn't work as designed | Fall back to explicit push-to-talk ("hold to give a command") — still live, still voice, just not ambient-listening |
| **Live API is still `[Preview]`** (per the SDK's own docstring) | Behavior/pricing/availability can change under us | Note it plainly, don't build as if it's a stable GA contract; `ARENA_PLAN.md`'s own posture (measure, don't assume) applies here too |
| **Reference-conditioned re-edit drifts** (inherited from `ARENA_PLAN.md` §3/§4's finding on shots) | "Make it blue" looks like a new random image | Same finding-not-bug posture as the rest of this project's gates |
| **Live camera + live mic = the most sensitive privacy surface in this app** | Nothing else here streams continuously | Explicit start/stop control, visible "live" indicator, no persistence of raw frames/audio beyond what a tool call actually consumes |
| **Model ID / Blob format guesses turn out wrong** | Phase 0 script fails on first run | That's fine — it's a five-line script, not a UI; the whole point of Phase 0 is finding this out cheaply |

---

## 8. Gate J results — ran for real, `gates/gate_j_live_tool_call.py`

**Passed, 7/7.** Real findings, not assumptions:

- Model ID confirmed by listing live-capable models against the real API, not guessed: `gemini-3.1-flash-live-preview` (added to `MODEL_ROUTING["live"]`). First attempt used `response_modalities=[TEXT]` and the API rejected it outright — `gemini-3.1-flash-live-preview` only supports `AUDIO` output. Fixed by requesting `AUDIO` + `output_audio_transcription` to get readable text without doing actual audio playback in the gate script.
- Tool-calling triggered correctly on all 3 effect requests ("give me a fireball," "make it blue," "turn it into lightning") and stayed silent on all 4 non-effect turns, including adversarial-ish ones ("what do you see right now," "hang on a second") that could plausibly have false-triggered.
- **The evolving-prompt behavior asked for is already happening, for free, in the model's own reasoning** — not something that needs separate state-tracking code. "Make it blue" didn't just say "make it blue," it returned a *complete* re-description: *"...flames are intensely bright blue and cyan"* (same fireball, recolored). "Turn it into lightning" then carried that color forward on its own: *"Crackling streaks of bright blue and white lightning..."* Gemini is doing the continuity reasoning in language; the image-generation step just needs to receive that full description plus the last frame as reference — it doesn't need to be told what changed, only what things should look like now.

## 9. Built and proven end-to-end for real (not mocked)

Backend (`engine/live_api.py`, mounted in `engine/api.py`): a `/live/{project_id}/session` WebSocket endpoint holding one shared `client.aio.live.connect()` session per project, relaying camera frames and mic audio in from multiple connections (tagged `camera` or `control`), handling `apply_effect` tool calls by running the existing `generate_image` path for real, and broadcasting results + transcripts back out. `GET /live/{project_id}/frame/{frame_id}` serves generated frames.

**Full real run, `role=control`, text input "give me a fireball", zero mocking:** connected → session started → tool fired with a real generated description → real NB2 Lite call → real image returned and served. **$0.045, matches the measured cost model in `ARENA_PLAN.md`.** The actual output is genuinely convincing — a photorealistic floating fireball with embers, not a rough sketch.

Frontend (`web/src/components/LiveCamera.tsx`, `/live` + `/live/[project]` pages): camera role captures frames via canvas snapshots (~1/s) and streams them binary over the socket; control role captures mic audio via `AudioContext`/`ScriptProcessorNode`, resamples to 16kHz PCM16, streams it, and has a text fallback; a compositing canvas draws the live camera frame as the base layer and the latest generated effect on top via a `lighten` blend so bright effect elements read as an overlay on the live feed rather than a flat photo swap. `tsc`/`astro build` both clean.

**What's proven:** the entire backend loop, for real, with real money spent and a real result. **What's not yet proven, because it needs an actual phone camera and microphone in a real browser to test:** the camera-frame capture loop and the mic → PCM16 → Gemini audio path. Those are implemented against the documented/introspected shapes but haven't run against real device hardware — that's the next real-world check, not a code-review one.
