# Floor

**An on-device turn-taking model that lets two people who share no language talk without waiting.**

Track 2 — Real-Time Multimodal Interaction. Gemini Live / Live Translate.
Target device: Moto G64 (Dimensity 7025, Mali-G615, 8–12 GB RAM).

---

## 1. The problem

Put two people in a room who share no language, hand them any translation product on the market, and watch what happens. One speaks. Stops. Waits. The device speaks. The other replies. Stops. Waits.

They are not having a conversation. They are exchanging telegrams.

The translation itself is no longer the bottleneck — Gemini 3.5 Live Translate does audio-to-audio across 70+ languages with no intermediate text, preserving intonation and pacing. **The bottleneck is that nothing knows when the interpreter should speak.**

A human interpreter does not wait for silence. They start before you finish, because they can hear you finishing. They say "mm-hm" while you talk, so you know they're following. They cut in when you run long. That behaviour has a name in the literature — **floor management** — and no shipping voice product implements it.

---

## 2. The thesis

> **Turn-taking is not endpointing.**

Endpointing answers one binary question: *has the user finished?*

Floor management answers three:
1. Is this a **turn-shift** (they're done, take the floor)?
2. Is this a **backchannel opportunity** (they're mid-thought, say "haan" and stay out of the way)?
3. Is this **overlap** (we're both talking, who yields)?

Every shipping system answers question 1. None answer 2 or 3.

---

## 3. Differentiator — the competitive landscape

Researched, not assumed. Every row verified against vendor docs or model cards.

| System | Signal type | Languages | Question it answers | On-device |
|---|---|---|---|---|
| OpenAI Realtime `server_vad` | audio volume; `threshold`, `silence_duration_ms`, `prefix_padding_ms` | any | "is there silence?" | no |
| OpenAI Realtime `semantic_vad` | semantic classifier over **words**; `eagerness` low/med/high → 8s/4s/2s max timeout | model-dependent | "has the user finished?" | no |
| LiveKit turn detector | **text** — runs on ASR transcripts | open weights | "has the user finished?" | yes |
| Krisp VIVA IP v1 | audio, ~6M params, 24 MB, 40 ms frames, threshold 0.4 | **English only** | "was that a real interruption, or a backchannel?" | yes |
| Krisp VIVA TP v3 | audio — prosody, pausing; no ASR needed | multilingual | "has the user finished?" | yes |
| Pipecat Smart Turn v3 | Whisper log-mel → ONNX, **12 ms CPU** | 23, incl. Hindi/Marathi/Bengali (**no Tamil**) | binary `COMPLETE` / `INCOMPLETE` | yes |
| Human-1 (Josh Talks) | end-to-end full-duplex Moshi fine-tune | Hindi | all of it — but it *is* the dialogue model | no (7B, GPU) |
| **Floor (this project)** | **audio, dyadic + agent state, 50 Hz** | **Hindi/Tamil/Telugu** | **shift vs backchannel vs overlap** | **yes** |

### What we claim, precisely

1. **Agent-side backchannel *production*.** Krisp *detects* when the user backchannels. Nobody *produces* agent backchannels. Saying "haan" while the other person is still speaking is, as far as this research found, implemented by no shipping system.
2. **Three-party floor management.** VAP is formulated for **dyadic** dialogue. An interpreter is a third participant who must take the floor from a speaker who hasn't finished, so the listener isn't left waiting. Not in the literature.
3. **Indic on-device turn-taking beyond binary endpointing.** The multilingual VAP paper's headline result: *a monolingual VAP model trained on one language does not transfer to another.* Indic turn-taking needs Indic training. Smart Turn covers Hindi — for endpointing only.

### What we do NOT claim

- Backchannel **prediction** is prior art: *Turn-taking and Backchannel Prediction with Acoustic and LLM Fusion*, `arXiv:2401.14717`. Cite it prominently. Our contribution is *production* and the *three-party* setting.
- We are not beating Smart Turn v3.1 at binary endpointing. Daily has shipped three versions. We aim to **match** it and extend the task.
- We do not claim offline operation. Translation content goes to Gemini. **Only the timing layer is on-device.**

---

## 4. Product

### What it is

A phone sits on the table between two people. Each speaks their own language. The phone interprets — and it manages the floor like a human interpreter would.

### Features

**F1 — Predictive floor handoff.**
The interpreter begins speaking *before* the speaker has fully stopped, because the model predicts the turn-end up to 2 s ahead. No dead air. This is the feature you can hear.

**F2 — Agent backchannels.**
While Speaker A talks, the phone emits a quiet "haan" / "hmm" at linguistically appropriate moments. Speaker A knows they're being followed. Synthesized **on-device** and mixed into the output stream — never round-trips to the cloud.

**F3 — Overlap tolerance.**
When both speak at once, the model decides who holds the floor rather than truncating whoever is louder.

**F4 — Barge-in that respects thought.**
A mid-sentence pause ("the thing is… ummm…") is not a turn-end. The model distinguishes a pause from a yield, so the interpreter doesn't trample a thinking speaker.

**F5 — Interruptible interpretation.**
Either human can cut into the interpreter itself. The floor model arbitrates between three participants, not two.

**F6 — Timing survives a bad network.**
The floor model runs at 50 Hz on the phone's CPU. Network jitter degrades *translation*, not *turn-taking* — the interpreter never freezes mid-handoff because a packet was late.

### Non-goals

- Offline translation. Content needs Gemini.
- Beating Google Translate on BLEU. We are not building a translator.
- A dashboard. (Explicitly disallowed by the hackathon anti-project list.)
- Medical, legal, or financial advice of any kind.

### Demo (90 seconds)

Two people, Hindi and Kannada, no shared language. They talk. Not in turns — *they talk.* One trails off mid-sentence; the phone waits. One says something long; the phone says "haan" partway through. They speak over each other; the phone doesn't panic.

Then switch off the floor model and run the same script with silence-threshold VAD. The room goes back to walkie-talkies.

---

## 5. Research contribution

### The model — `FloorVAP-Indic`

Follows the VAP formulation exactly, so numbers are comparable to published work.

**Input.** Stereo, one channel per participant. **16 kHz**, **50 Hz** frame rate, context ≤ 20 s.

**Encoder.** Frozen, per-channel. VAP uses CPC (output dim 256). The multilingual paper compares CPC (English-pretrained) vs **MMS** (multilingual wav2vec 2.0). We ablate CPC / MMS / Whisper log-mel — the last because Smart Turn proves it runs in 12 ms on CPU.

**Body.** One-layer self-attention Transformer per channel → cross-attention Transformer across channels.

**Objective.** Joint voice activity of both speakers over the next **2 seconds**:

```
bins:   0–200 ms │ 200–600 ms │ 600–1200 ms │ 1200–2000 ms
        2 speakers × 4 bins = 8 binary values = 2^8 = 256 classes
```

Shift, backchannel, and overlap are **decoded from the 256-way posterior** — not separate heads. One model, three questions.

**Our extension — the third participant.**
Three speakers × four bins would be `2^12 = 4096` classes. Intractable. Instead: condition the dyadic head on an **agent-state embedding**, plus an explicit action head over `SPEAK / BACKCHANNEL / HOLD`.

> ⚠️ This is the single design decision most likely to be wrong. It is my invention, not a published result. Validate on synthetic three-party audio in Phase 4 before building anything on top of it.

### The data strategy

The corpus we need does not exist in the open. Josh Talks trained Human-1 on 26,000 h of real two-person Hindi conversation — and **released the model, not the data** (`JoshTalksAI/Human-1`, CC-BY-4.0, 134 downloads).

So we manufacture the corpus from the model.

Moshi (Human-1's base) **models both speakers as parallel streams**, explicitly "to allow the modeling of arbitrary overlap." Sample two-sided Hindi dialogue from Human-1; decode each stream through Mimi separately.

**Because the streams are separate by construction, per-channel voice activity is exact.** No diarization. No manual annotation. No label noise. This is what makes the project feasible in a month.

Event extraction is automatic too — VAP derives shift / hold / backchannel / overlap from voice activity using timing constraints (mutual-silence windows; short utterances bracketed by the other speaker). We inherit the protocol.

**Real held-out test set.** `snorbyte/indic-audio-dialog-sample` and `snorbyte/indic-audio-natural-conversations-sample` — CC-BY-4.0, source-separated multichannel, Hindi/Tamil/Telugu. Small, but real. **Never train on these.**

**The central scientific risk:** a student trained on Moshi-generated dialogue may learn *Moshi's* turn-taking tics rather than human ones. Synthetic→real transfer *is* the experiment. If it fails, fall back to fine-tuning Smart Turn v3 on the snorbyte samples and report an honest negative result — still a paper, but not a demo.

### Evaluation

**Baselines**, increasing in strength:
1. Silence-threshold VAD — the industry default.
2. **Pipecat Smart Turn v3.1** — public weights, public test set (`smart-turn-data-v3-test`), public `benchmark.py`.
3. Human-1 itself as a topline (it saw 26,000 h; we didn't).

**Metrics:**
- **Balanced accuracy** on hold/shift. *Not* weighted F1 — holds are ~10× more frequent than shifts and F1 flatters.
- Backchannel prediction accuracy.
- Overlap detection.
- **LAAL** (from simultaneous-translation literature) for end-to-end interpreter latency.
- CPU wall-clock on the Moto G64. Target **≤ 25 ms/frame** at 50 Hz, vs Smart Turn's 12 ms.

**The claim:** match Smart Turn on binary endpointing on its own benchmark; establish the **first baseline** on backchannel and overlap for Indic, on-device.

---

## 6. System architecture

```
Speaker A (Hindi) ──┐                                     ┌── Speaker B (Kannada)
                    │                                     │
                    ▼                                     ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Android app — Moto G64                                  │
   │                                                          │
   │   FloorVAP-Indic   (ONNX, CPU, ≤ 25 ms/frame, 50 Hz)     │
   │        │                                                 │
   │        │  SPEAK / BACKCHANNEL / HOLD                     │
   │        │                                                 │
   │        ├── BACKCHANNEL → local TTS "haan"                │
   │        │                  mixed into output stream       │
   │        │                  (never sent to cloud)          │
   │        │                                                 │
   │        └── SPEAK / HOLD → activity_start / activity_end  │
   │                                │                         │
   └────────────────────────────────┼─────────────────────────┘
                                    ▼
                    Gemini 3.5 Live Translate  (WebSocket)
                    realtimeInputConfig.automaticActivityDetection.disabled = true
                    audio-to-audio · 70+ languages · no intermediate text
```

### Why the backchannel must be local

Pipecat's activity-window contract streams audio to Gemini **only between `activity_start` and `activity_end`**; the service discards anything outside that window. An agent that speaks *during* the user's turn violates the contract outright.

So backchannels are synthesized on-device and mixed into the output. This is a real architectural consequence of the research idea — and it is what makes the phone load-bearing rather than decorative.

### Integration points (already verified to exist)

- `pipecat.audio.turn.base_turn_analyzer.BaseTurnAnalyzer` — the extension point. `FloorVAP-Indic` subclasses it.
- `GeminiVADParams(disabled=True)` — Pipecat 1.5.0 already sends `activity_start` / `activity_end` and maintains a rolling pre-roll buffer (`user_audio_preroll_secs`) so speech onset isn't clipped.
- `pipecat.services.google.gemini_live.llm.GeminiLiveLLMService` — swap the model to `gemini-3.5-live-translate-preview`.

---

## 7. Current state of the repo

Written during an earlier direction (a WhatsApp call-screening agent) that we abandoned. Assess honestly:

| File | Status |
|---|---|
| `bot.py` | **Reuse.** A working Gemini Live voice loop (Silero VAD, streaming, pipeline). This is the harness for Gate A. Swap the system prompt and VAD params. |
| `server.py` | **Dead.** WhatsApp webhook + WebRTC handoff. Not needed for the interpreter. Delete or park in `legacy/`. |
| `pyproject.toml`, `.python-version`, `.env`, `.gitignore` | **Reuse.** `uv` + Python 3.12, Pipecat 1.5.0 with `[google,silero,webrtc]`, prebuilt browser UI. |

Verified working: server boots; webhook verification echoes `hub.challenge`, rejects bad tokens with 403, rejects bad bodies with 400; `pipecat 1.5.0` + `google-genai 2.10.0` import cleanly; `python bot.py -t webrtc` serves a browser test UI.

**Not a git repository yet.** `git init` before touching anything else.

---

## 8. Development plan

### Phase 0 — Two gates. Nothing else starts.

Both are single points of failure. Both are cheap. Run them first.

**Gate A — does manual activity detection actually work?**
Set `GeminiVADParams(disabled=True)`. Drive 20 turns through `bot.py`. Confirm the model responds after *every* `activity_end`, and the session survives.

There is a public bug report where the session dies with a `1011 keepalive ping timeout` and the model never responds after `activityEnd` on `gemini-2.5-flash-native-audio-preview`. Pipecat's implementation looks mature enough to have handled it. "Looks mature" is not "I saw it work."

- **Blocked on:** `GOOGLE_API_KEY` in `.env`
- **Cost:** half a day
- **Verify:** 20/20 turns get a response; session survives 5 minutes idle
- **☠️ If this fails, Track 2 is dead.** No lever, no project. Fall back to Track 4.

**Gate B — does Human-1 sample *both* streams?**
Load `JoshTalksAI/Human-1` on a GPU. Sample. Confirm both audio streams are populated — not just the assistant's. Measure how often backchannels and overlaps actually occur.

- **Blocked on:** GPU access (7B Moshi derivative; will not run on a MacBook)
- **Cost:** one day
- **Verify:** both streams non-silent; overlap present; backchannel rate within an order of magnitude of human dialogue
- **☠️ If it's single-stream only**, the synthetic-corpus strategy dies. Fall back to fine-tuning Smart Turn v3 on the snorbyte samples — smaller contribution, still real.

---

### Phase 1 — Synthetic corpus (week 1)

Sample ~50 h of two-stream Hindi dialogue from Human-1. Decode each stream via Mimi separately. Compute per-channel voice activity. Extract shift / hold / backchannel / overlap events using the VAP timing protocol.

**Verify:** event frequencies within an order of magnitude of published human-dialogue statistics — notably, **shifts should be ~10× rarer than holds**. If Human-1 backchannels every two seconds, the teacher is unusable and we stop.

---

### Phase 2 — The dyadic student (week 2)

VAP architecture, 256-class objective, trained on the synthetic corpus. Ablate the encoder: CPC vs MMS vs Whisper log-mel.

**Verify:** balanced accuracy on hold/shift beats the silence-threshold baseline **on the snorbyte real test set**.

This is the synthetic→real transfer question. **It is the whole project.** Everything downstream assumes it passes.

---

### Phase 3 — Benchmark against Smart Turn (week 2–3)

Run `benchmark.py` from `pipecat-ai/smart-turn` on `smart-turn-data-v3-test`. Report binary endpointing, Hindi split.

**Verify:** within ~2 points of Smart Turn v3.1. Report the number whichever way it falls — a plot where we lose by 1.5 points and win on backchannels is a stronger submission than a plot with one bar.

---

### Phase 4 — The three-party head (week 3)

Add agent-state conditioning and the `SPEAK / BACKCHANNEL / HOLD` action head. Simulate the interpreter as a third participant in synthetic audio.

**Verify:** the agent takes the floor before the speaker's turn ends *without truncating them*. Report **LAAL vs truncation rate as a curve**, not a point — the tradeoff is the finding.

---

### Phase 5 — On-device (week 4)

Export to ONNX. Benchmark on the Moto G64.

**Verify:** ≤ 25 ms/frame at 50 Hz, **sustained** — measure at minute 5, not minute 0. Mid-range SoCs throttle.

---

### Phase 6 — The interpreter (week 4–5)

Wire `FloorVAP-Indic` into Pipecat as a `BaseTurnAnalyzer`. Local backchannel TTS mixed into the output stream. `gemini-3.5-live-translate-preview` for content.

**Verify:** two people who share no language hold a conversation. Measure end-to-end LAAL and **count how many times either person has to wait.** That count, before and after, is the demo.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Gate A fails** — manual activity detection broken | Track 2 dead | Half-day test, first thing. Fall back to Track 4. |
| **Human-1 is single-stream** | Data strategy dead | Fall back to fine-tuning Smart Turn on snorbyte samples |
| **Synthetic→real transfer fails** | Core result dead | Publishable negative result; demo falls back to Smart Turn baseline |
| **No GPU access** | Phase 1 impossible | Colab / RunPod. Budget for it now, not in week 2. |
| **Three-party head is the wrong shape** | Phase 4 stalls | It's my invention; validate on synthetic data before Phase 6 depends on it |
| **Tamil has no Smart Turn baseline** (not in the 23 languages) | No comparison | Use as a zero-shot generalization probe, not a headline number |
| **Judge finds `arXiv:2401.14717` first** | Credibility | Cite backchannel-prediction prior art prominently and early |
| **Thermal throttling on G64** | Latency target missed | Measure sustained, not peak. Shrink encoder if needed. |

---

## 10. Open questions

1. Does Human-1 sample both streams, or only the assistant's? *(Gate B)*
2. Is CPC-vs-MMS the actual cause of cross-lingual non-transfer, or is it the training data? *(Phase 2 ablation)*
3. Can a 6M-parameter student (Krisp VIVA IP's scale) carry a 256-class objective, or does it need Smart Turn's Whisper encoder? *(Phase 2)*
4. Does `gemini-3.5-live-translate-preview` honour `automaticActivityDetection.disabled`, or is manual VAD only wired up on the native-audio models? *(Gate A, extended)*

---

## 11. References

**The objective**
- Ekstedt & Skantze. *Voice Activity Projection: Self-supervised Learning of Turn-taking Events.* Interspeech 2022.
- Inoue et al. *Real-time and Continuous Turn-taking Prediction Using Voice Activity Projection.* IWSDS 2024. [`arXiv:2401.04868`](https://arxiv.org/abs/2401.04868)
- Inoue et al. *Multilingual Turn-taking Prediction Using Voice Activity Projection.* [`arXiv:2403.06487`](https://arxiv.org/abs/2403.06487) — architecture numbers; cross-lingual non-transfer; balanced accuracy.

**The teacher**
- Défossez et al. *Moshi: a speech-text foundation model for real-time dialogue.* [`arXiv:2410.00037`](https://arxiv.org/abs/2410.00037) — Mimi codec (RVQ, `Q=8`, 12.5 Hz, cardinality 2048); RQ-Transformer; multi-stream modelling.
- Josh Talks. *Human-1: A Full-Duplex Conversational Modeling Framework in Hindi.* [`arXiv:2604.23295`](https://arxiv.org/abs/2604.23295) · weights: [`JoshTalksAI/Human-1`](https://huggingface.co/JoshTalksAI/Human-1) (CC-BY-4.0)

**The policy**
- Papi et al. *AlignAtt.* [`arXiv:2305.11408`](https://arxiv.org/abs/2305.11408) — read/write policy; LAAL metric.
- *Turn-taking and Backchannel Prediction with Acoustic and LLM Fusion.* [`arXiv:2401.14717`](https://arxiv.org/abs/2401.14717) — **prior art on backchannel prediction. Cite prominently.**

**Baseline & harness**
- [`pipecat-ai/smart-turn`](https://github.com/pipecat-ai/smart-turn) — BSD-2. `train.py`, `train_modal.py`, `benchmark.py`.
- [`pipecat-ai/smart-turn-data-v3-test`](https://huggingface.co/datasets/pipecat-ai/smart-turn-data-v3-test)
- Daily. [*Announcing Smart Turn v3, with CPU inference in just 12ms*](https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/)

**Data**
- [`snorbyte/indic-audio-dialog-sample`](https://huggingface.co/datasets/snorbyte/indic-audio-dialog-sample) — CC-BY-4.0, hi/ta/te, source-separated
- [`snorbyte/indic-audio-natural-conversations-sample`](https://huggingface.co/datasets/snorbyte/indic-audio-natural-conversations-sample)

**Platform**
- [Live API capabilities — manual activity detection](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- [Gemini 3.5 Live Translate](https://ai.google.dev/gemini-api/docs/live-api/live-translate)
- [Known issue: manual VAD, session dies after `activityEnd`](https://discuss.ai.google.dev/t/gemini-2-5-flash-native-audio-preview-with-manual-vad-disabled-true-gemini-never-responds-after-activityend-session-dies-with-1011-keepalive-ping-timeout/141373)

**Competitive**
- [OpenAI Realtime — VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad)
- [LiveKit — turn detection and interruption handling](https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection)
- [Krisp — turn-taking and interruption prediction](https://krisp.ai/blog/voice-ai-turn-taking-interruption-prediction/)
