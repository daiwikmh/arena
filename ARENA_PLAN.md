# Arena

*(formerly "Shotlist" — same repo, same direction, renamed)*

**A conversational video-direction engine. A cheap keyframe (Nano Banana 2 Lite) gates an expensive animation (Gemini Omni Flash); the agent proposes, the human approves, and only approved frames get animated. Multi-shot timelines assemble the same way a draft DAG assembles proofs — by branching, never overwriting.**

> Supersedes `PRESSCHECK_PLAN.md`'s poster-localization thesis. The engine, draft system, critic split, agent bar, and Astro/tldraw/FastAPI stack carry over; the domain (locale × format ad proofs) does not. `DEVELOPMENT_PLAN.md` (Floor) remains untouched and unrelated.

---

## 1. The problem

The brief: *redefine how humans direct and manipulate motion — swap elements, apply motion transfers, build multi-shot narrative timelines, through a conversational interface, respecting physical world dynamics.*

Two things already exist and are both wrong for this, in different ways. Manual video editors are frame-accurate but not conversational — you scrub, you don't converse. Text-to-video generators are conversational but not *directorial* — each generation is an isolated clip with no cross-shot memory, no way to say "keep everything, just swap the car."

Cardboard (named in the brief as a UI/UX reference) solves a real but different problem: turning a pile of **already-shot raw footage** into a cut, captioned, paced edit via VLM-driven semantic search across existing clips. That is not what we are building. We are directing footage that does not exist yet — generating and animating shots, not organizing ones a camera already captured. We borrow Cardboard's vocabulary (upload-and-describe, agentic, browser-native, no timeline scrubbing) and leave its footage-ingestion engine alone; replicating that is a different, larger, already-funded problem.

---

## 2. The thesis

> **The keyframe is the review surface. The clip is the commitment.**

Presscheck's thesis was "generation is cheap, human attention is what's expensive — spend generation freely, gate attention." Here the asymmetry is reversed in exactly one place: **a keyframe costs 3.4¢ and ~4 seconds; a 10-second clip costs $1.00** — roughly 30× more. Iterating on Omni Flash the way you'd iterate on NB2 Lite is how a demo burns its budget in the first five minutes.

So the gate moves, not the shape of the idea. NB2 Lite proposes and re-proposes a keyframe for nearly nothing — swap the subject, change the lighting, try a different composition — until it's approved. Only the approved frame is ever animated. This is the same "cheap thing gates expensive thing" architecture as Presscheck's critic system, aimed at a different bottleneck.

Google's own launch post states this pipeline outright, unprompted: *"Use Nano Banana 2 Lite as a high-speed image generation model, then pass that image as a reference to Gemini Omni Flash to animate it into a high-quality video."* We are not inferring the architecture — it's the documented intended use.

Multi-turn conversational editing ("make it night," "swap the car for a truck") is native to Omni Flash, chained via `previous_interaction_id` — verified against the installed SDK, not just the docs. But Google states a hard ceiling: **three sequential edits per session.** That constraint has to be designed around from the start, not discovered live during a demo.

---

## 3. What we claim, precisely

1. **Keyframe-gates-clip is forced by the pricing table, not a stylistic choice.** A 30× cost asymmetry between propose and commit means the agent's real job is getting the keyframe right before spending anything on motion.
2. **The draft DAG generalizes cleanly.** Presscheck's `Draft.parent` branching (§7 of the old plan) was "one image, N repair variants." Here it becomes "one shot, with a keyframe child and a clip child" — regenerating the clip doesn't touch the keyframe; editing the keyframe orphans (but doesn't delete) its old clip. Same content-addressing discipline, same immutability guarantee, one more level of tree.
3. **Continuity is partially arithmetic, same split as the old typographic critic.** Frame-to-frame color/brightness consistency between adjacent shots is a histogram comparison — deterministic, cheap, no model. Whether a swapped element's motion looks *physically plausible* — does it respect gravity, does the shadow track the light source, does perspective hold as the camera moves — is judgment, and stays on a vision critic pass over the actual output.
4. **The 3-turn ceiling is a first-class constraint, not an edge case.** The agent must track turns spent per shot and either warn before the limit or explicitly start a fresh interaction, rather than let a 4th "just one more edit" silently degrade or fail against a wall.

### What we do NOT claim

- We are not building a general non-linear editor. No arbitrary raw-footage ingestion, no manual scrubbing. Cardboard already does that well; it is out of scope here by choice, not oversight.
- We do not claim the physical plausibility of AI-generated motion — that is Omni Flash's problem, not ours. Our contribution is *catching* implausible results (the continuity critic), not preventing the model from ever producing them.
- Generator→critic→repair as a pattern is prior art carried over unchanged from Presscheck: Self-Refine (`arXiv:2303.17651`), Reflexion (`arXiv:2303.11366`).
- Bounded generation (constrain the model to configure a fixed shot/timeline schema rather than free-form output) is prior art — Portal UX Agent, `arXiv:2511.00843` — same citation as before, same reason.

---

## 4. What the platform actually gives us

Verified two ways this session: against Google's own launch post and docs, **and** by introspecting the actually-installed `google-genai==2.10.0` SDK directly — `client.interactions.create()`, `previous_interaction_id`, and the `task` literal (`text_to_video | image_to_video | reference_to_video | edit`) all confirmed present in the installed package, not just described in marketing copy.

| | Nano Banana 2 Lite | Gemini Omni Flash |
|---|---|---|
| Model ID | `gemini-3.1-flash-lite-image` | `gemini-omni-flash-preview` |
| Cost | ~$0.047 / image (1K), **measured**, see below | **$0.10 / second** standard, **$0.05 / second** batch |
| Latency (serial) | **4.50s measured** — matches marketing | not published; **Gate F measures it** |
| Latency (concurrent) | **severely degraded, 28–96s per call under load — see below** | not yet measured |
| Max output | one still frame | **10 seconds**, "longer coming soon" |
| Multi-turn | `previous_interaction_id`, no stated cap | `previous_interaction_id`, **capped at 3 sequential edits** |
| Inputs | text + up to 14 object refs | text, image, video (video refs ≤3s **not reliably processed**) |
| Task modes | n/a | `text_to_video`, `image_to_video`, `reference_to_video`, `edit` |
| Stated limitations | no style refs (old finding, still true) | no audio references, no scene extension, **character consistency issues across scene changes/pans** |
| Region gates | none stated | editing uploaded video **unavailable in EEA** and select regions |

**The load-bearing row is the cost gap.** $0.0336 vs $0.10/sec is roughly 30×, and a single 10-second clip alone is already 30× a keyframe. Any architecture that iterates the keyframe stage on Omni Flash instead of NB2 Lite is burning the budget on the wrong step.

**The second load-bearing row is "character consistency issues across scene changes/pans."** That is Google's own stated limitation, and it sits directly on top of the brief's bar — *"respects physical world dynamics."* The continuity critic (§5) exists specifically because this is a named, acknowledged weakness of the model we're chaining into, not a hypothetical.

### Gate A results — run for real against NB2 Lite, this session

Gate A (inherited from `PRESSCHECK_PLAN.md`, and directly applicable here since Arena also generates keyframes on NB2 Lite) finally ran against a working key. Three real findings, none of them the assumption the plan launched with:

1. **Real cost is ~$0.047/image, not $0.0336.** Measured `candidates_tokens` averaged ~1,550 across 40+ real calls (single call: 1,548; 30-way burst: 1,494–1,624), not the ~1,120 the original math assumed. At $30/1M output tokens that's **$0.0465/image**, about 38% higher than planned. Every cost figure in this document using $0.0336 is now a floor, not the real number — see the corrected model below.
2. **Serial latency matches the marketing claim exactly: 4.50s for one image, uncontended.** The "~4 seconds" figure is real. This is good news the plan should say plainly rather than bury under the bad news below.
3. **Concurrency causes severe, non-linear latency degradation — with no errors to catch it.** 30 simultaneous calls: 0 failures, 0 rate-limit rejections, but average latency rose to ~35s (range 28–38s) — roughly 8× the serial baseline. A *smaller* burst of 10 concurrent calls was measured even worse (avg 73.9s, range 46–96s), which is not what a clean "more concurrency, more queueing" model would predict — the degradation is real but noisy, not a smooth curve we can extrapolate from two data points. **The practical implication: this API does not protect itself with 429s under load — it silently gets slow instead.** The `max_concurrent`/`TokenBucket` scheduler already built into `engine/executor.py` and `engine/shots/executor.py` is not a nice-to-have; it is the only thing standing between this product and an unpredictable multi-minute hang during a live demo. **Recommendation: cap concurrency low (start at 3–5) and measure again before trusting any higher number.**

One more finding, unglamorous but load-bearing for repair/chaining: **every call — serial and concurrent — returned `interaction_id: None`.** `engine/models.py`'s `generate_image()` goes through the plain `generate_content()` surface, not `client.interactions.create()`. If `previous_interaction_id`-based branching (§7 of `PRESSCHECK_PLAN.md`, inherited into this plan's repair story) requires a real interaction ID, **the current image-generation code path cannot produce one.** This needs resolving before Phase 6 (repair) is trusted: either switch keyframe generation to the Interactions API surface, or accept that keyframe repair branches by content-address alone (already true and sufficient) and drop the interaction-chaining assumption for images specifically — Omni Flash's `client.interactions.create()` path (verified separately, §11) is unaffected and still the right surface for video.

Not retested (explicit instruction: no further image-generation calls this session) — the IPM ceiling itself is still not pinned to a number, only bracketed: 30 concurrent succeeds without hard failure, but "succeeds" now means "eventually, slowly," which changes what the number is even for.

### Cost model

```
1 keyframe   (NB2 Lite, 1K)             $0.047    measured — 4.5s serial, degrades hard under concurrency
1 base clip  (Omni Flash, 10s)          $1.00     standard  /  $0.50 batch
1 edit turn  (Omni Flash, same 10s)     $1.00     — same per-second rate, new interaction

5-shot timeline, one edit pass per shot:
  5 keyframes     5 × $0.047   =  $0.24
  5 base clips    5 × $1.00    =  $5.00
  5 edit turns    5 × $1.00    =  $5.00
                                  ───────
                                  $10.24 per 5-shot timeline
```

The keyframe-vs-clip cost ratio barely moves (still ~21×, not the ~30× originally stated) — the core "cheap gates expensive" argument survives the correction intact. What changes is the demo's throughput claim: don't promise N keyframes "in under a minute" without re-measuring at the concurrency level actually used, because the one data point available says that promise is currently false.

Say the $0.17 vs $10.17 split out loud in the demo. It is the whole argument for why keyframe iteration happens on NB2 Lite and nowhere else — regenerating a keyframe 10 times to get it right costs 34 cents; regenerating a *clip* 10 times costs ten dollars.

---

## 5. Architecture

### What carries over from Presscheck, structurally unchanged

- **The draft DAG** (`Draft.id`, `Draft.parent`, content-addressed cache) — extended to store video blobs alongside image blobs, keyed the same way.
- **The critic split** (deterministic tier + LLM judgment tier) — the *pattern* survives; the checks themselves are new (§ below).
- **FastAPI campaign model, agent bar, Yjs `/sync` mount, tldraw canvas** — all infrastructure, none of it poster-specific.
- **Repair-as-branch** (`engine/repair.py`) — regenerating a shot produces a sibling draft, never an overwrite. Directly reusable.

### What's new

**`ShotSpec`** replaces `SceneSpec`: subject, action/motion description, camera movement, duration (≤10s), object refs. Flat, same reasoning as before — Gemini's structured output rejects deep nesting.

**Two-stage generation per shot:**

```
ShotSpec ──► keyframe (NB2 Lite, task=n/a, plain image gen)
                │
                │  approved keyframe becomes the reference image
                ▼
          clip (Omni Flash, task=image_to_video)
                │
                │  conversational refinement, previous_interaction_id
                ▼
          edited clip (task=edit, ≤3 turns per session)
```

**`Timeline`** = ordered list of shots + transition metadata between adjacent shots.

### The editing surface — two views, not one

Cardboard's interface (the reference named in the brief) splits cleanly into two things that only look like one panel: a **storyboard** (media bin — discrete, comparable items) and a **timeline** (linear, playhead-driven, transport-controlled). We keep that split explicit rather than forcing both through one metaphor:

- **Storyboard = tldraw, unchanged from Presscheck's pattern.** `ShotFrame` (renamed `ProofFrame`) holds keyframe *candidates* — an agent proposing three different compositions for shot 2 is exactly the "review surface, not creation surface" grid tldraw already does well. Multiplayer works for free — it's the same `/sync` mount, same Gate-D-verified origin-scoped undo.
- **Timeline = purpose-built, not tldraw.** Cardboard's bottom panel — ruler, playhead, transport controls, a horizontal strip of clips — is a linear NLE metaphor tldraw's infinite canvas actively fights. Built as a dedicated React component instead (§ tech stack).

The chrome those two views sit inside is modeled directly on the reference screenshot: a left icon rail (media bin / storyboard / music / captions / voice / text), a center preview player with a "ready when you are" ghost state before anything's generated, the timeline along the bottom, and an AI-director chat thread on the right — replacing the single-shot `AgentBar` with a running conversation, since Omni Flash's `previous_interaction_id` turns are themselves a conversation and the UI should look like one.

**What we deliberately don't copy from Cardboard:** semantic search across uploaded footage, speaker diarization, dead-air/audio cleanup, dubbing. All of those assume footage that was already shot by a camera. Ours doesn't exist until the agent generates it — there's nothing for those features to operate on. Multi-format reframe and animated captions/titles *do* carry over — both operate on output we control either way.

**The continuity critic**, same two-tier split as the typographic critic it replaces:

| Check | Tier | How |
|---|---|---|
| Boundary color/brightness match between adjacent shots | deterministic | histogram diff on first/last frame, no model |
| Duration/aspect-ratio sanity | deterministic | arithmetic |
| Element swap preserves lighting direction / shadow / perspective | **vision judgment** | Omni Flash's own stated weak spot — this is what the LLM tier exists to catch |
| Motion looks physically plausible (gravity, momentum) | **vision judgment** | same tier |

### The 3-turn ceiling, designed around explicitly

The agent tracks `turns_used` per shot's interaction chain. At turn 3 (Google's stated cap), the agent either declines further edits with a clear message or explicitly opens a **new** interaction seeded from the current clip as a fresh `image_to_video` reference — a conscious reset, not a silent failure. **Gate H** checks which of these actually happens when you push past the limit for real.

---

## 5a. Tech stack — the editing surface

New, on top of everything already in `PRESSCHECK_PLAN.md` §10 (Astro, tldraw, Yjs, FastAPI, `uv`/Python — all unchanged).

| Piece | Choice | Why |
|---|---|---|
| Icon rail, media bin, director-chat panel | Plain React components, no new library | Same complexity class as `AgentBar`/`ReviewPanel`, already proven out |
| Timeline (ruler, playhead, transport, shot strip) | **Purpose-built React component** — no NLE framework | Our unit is a *shot* (discrete, AI-generated, duration known up front), not an arbitrary frame range. A real NLE timeline (ripple edit, trim handles, frame-accurate scrubbing) solves a harder problem than we have — Cardboard needs that because it ingests real footage; we don't |
| Video preview (single shot / scrubbing) | Native `<video>` | No transcoding, no format juggling — Omni Flash output plays directly |
| Video preview (**playing the assembled timeline** — multiple clips back to back) | **`@remotion/player`** | The one place a library earns its keep: sequencing N clips with transition timing in React is exactly Remotion's job, and it renders the same composition server-side later for a real export — not just a browser toy |
| Storyboard (keyframe candidates) | tldraw, `ShotFrame` (renamed `ProofFrame`) | Unchanged from Presscheck — see §5 above |
| Multi-format reframe | Reuse the 10-aspect-ratio format catalog from `web/src/lib/catalog.ts` | Same list, same problem, already typed |
| Continuity thumbnails / boundary-frame extraction | `ffmpeg.wasm` (client-side) **or** a small server-side endpoint using `ffmpeg` via subprocess | Needed to pull first/last frames for the deterministic continuity check (§5) and to generate timeline-strip thumbnails without re-fetching the full clip. Server-side is simpler and keeps `ffmpeg` off the client bundle — default to that unless client-side scrubbing thumbnails prove necessary |

**Rejected:** a full NLE library (e.g. wrapping a WebCodecs-based frame-accurate editor). We are arranging and re-generating discrete shots, not trimming arbitrary footage — that complexity buys us nothing our actual workflow needs.

---

## 6. Gates. Nothing else starts until these run.

**Gate E — does the NB2 Lite → Omni Flash chain actually work?** ☠️

Generate a keyframe on NB2 Lite. Pass it as the reference image to Omni Flash with `task=image_to_video`. Does the animated clip actually resemble the keyframe, or does the model drift/hallucinate a different scene?

- Verify: subject, composition, and palette recognizably survive the handoff.
- **If this fails, the entire thesis fails** — the whole architecture is "cheap frame gates expensive clip," and that's meaningless if the clip doesn't respect the frame.

**Gate F — conversational edit latency.**

Time a base `image_to_video` generation vs. a follow-up `edit` turn via `previous_interaction_id`. Is the edit meaningfully faster (justifying "conversational"), or does every turn cost the same ~10s-clip latency regardless?

- Verify: record both latencies. If edit turns are just as slow as a fresh generation, "conversational" is a UX framing problem, not a technical win — say so in the demo rather than overselling it.

**Gate G — physical plausibility of an explicit element swap.**

"Swap the car for a truck." Does the swapped object sit in the same position, respect the same lighting direction, cast a consistent shadow, hold perspective as the (if any) camera moves?

- Verify by eye, then by the vision critic — this is the literal bar stated in the brief, not a nice-to-have.
- If swaps visibly break physics, that's not a failure to hide — it's the finding. Report it plainly; a demo that shows the failure mode and how the critic catches it is a stronger submission than one that pretends it doesn't happen.

**Gate H — what actually happens at the 3-turn ceiling?**

Push a 4th sequential edit past Google's stated cap on the same interaction chain.

- Verify: does the API reject it cleanly (checkable error), silently start fresh context, or degrade output quality? Whichever it is, the agent's turn-tracking logic (§5) needs to match reality, not the docs' description of it.

---

## 7. Phases

**Phase 1 — keyframe generation. ✅ DONE.** `ShotSpec` added to `engine/ir.py` (`duration_sec` capped at 10 — Omni Flash's launch limit enforced at the type level). `engine/shots/` mirrors `engine/prompt/`: `templates.py` compiles camera movement into a composition bias (`pan_right` → subject left, room opens right — same "geometry compiles into the prompt" trick as the old negative-space directive), `compile.py`, `executor.py` reuses `TokenBucket` and `generate_image(role="scene")` from the poster executor unchanged. *Verify:* 72/72 tests green — golden snapshots (zero API calls, one shot per camera movement, opposite-pan / opposite-tilt bias confirmed), plus mocked-executor tests confirming editing one shot's action text regenerates only that shot.

**Phase 2 — single-shot animation. ✅ CODE DONE, GATE E STILL PENDING.** `generate_clip()` added to `engine/models.py`, wired to the real `client.interactions.create()` surface (verified against the installed SDK's `CreateModelInteractionParam`/`ImageContentParam`/`ModelOutputStep`/`VideoContent` shapes — not guessed from docs alone). `engine/shots/clip.py` mirrors the keyframe executor: content-addressed cache keyed on `(shot, keyframe_draft_id, template, model)` — so re-approving the *same* keyframe hits cache, but a new keyframe correctly invalidates the clip. `build_clip_draft()` sets `Draft.parent = keyframe_draft_id`, making the plan's central DAG claim (§5) concrete rather than aspirational. `POST /projects/{id}/shots/{id}/clip` and `GET .../clip/video` wired into the API. *Verify:* 98/98 tests green, all mocked — **zero real calls made, by instruction.** Gate E (does the animated clip actually respect the keyframe) cannot be marked passed until a real `image_to_video` call runs. Two things Gate E must also settle that the mocks can't: whether `data` on `ImageContentParam` wants raw bytes or a pre-base64-encoded string (implemented as raw bytes, unverified), and what `interaction.steps` actually looks like in a live response (parsing logic is real but untested against the true wire shape).

**Phase 3 — conversational edit loop.** `previous_interaction_id` chaining, turn-tracking, the Gate H fallback behavior implemented for real. *Verify:* three sequential edits succeed; the fourth is handled deliberately, not by accident.

**Phase 4 — multi-shot timeline + continuity critic.** Assemble N shots; deterministic boundary checks first, vision critic second. *Verify:* a fixture corpus with known-broken boundaries (mismatched color grade) catches 100% with zero false positives — same bar the typographic critic had to clear.

**Phase 5 — tldraw timeline UI.** `ShotFrame` shape, sequential canvas layout, agent bar drives shot-by-shot generation and edit turns. *Verify:* the review-panel pattern from Presscheck adapts directly — flagged shots (continuity breaks) surface the same way flagged proofs did.

**Phase 6 — repair as branch.** Regenerating a shot's clip is a new child draft; the keyframe is untouched unless explicitly re-generated. *Verify:* rejecting a regenerated clip costs $0 and reverts to the parent — the exact test pattern already written for Presscheck's `repair.py`.

---

## 8. The demo

One conversational session, three shots: *"a marble rolling down a chain-reaction track."* The agent proposes three keyframes — cheap, fast, visibly iterable. Approve them. The agent animates each on Omni Flash. Mid-timeline: *"swap the marble for a golf ball."* The edit applies via `previous_interaction_id`, in place, without re-describing the shot. The continuity critic checks the boundary between shots 1→2→3 and flags anything that broke.

The number to say out loud is **$0.17 vs $10.17** — what iteration would have cost on the expensive model versus what it actually cost by keeping the cheap model in the loop.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Gate E fails** — Omni Flash doesn't respect the NB2 Lite keyframe | The core thesis is dead | Fall back to `text_to_video` per shot, losing the cost-gating story entirely — a materially weaker submission, flagged immediately if this happens |
| **Gate F shows no latency win on edits** | "Conversational" is UX framing, not a technical result | Say so plainly in the demo; the multi-turn *statefulness* (no re-describing the scene) is still a real, honest win even without a speed win |
| **Gate G shows visible physics breaks on swaps** | Directly hits the brief's stated bar | This is the finding, not a bug to hide — show the critic catching it |
| **3-turn ceiling hit mid-demo** | Live failure in front of judges | Gate H determines the fallback *now*, not live; rehearse the reset path |
| Character consistency drifts across scene changes (Google's own stated limitation) | Multi-shot narrative coherence suffers | This is exactly what the continuity critic exists to catch — treat every drift the critic finds as validation of the architecture, not an embarrassment |
| Region gating (EEA) blocks video editing | Demo breaks depending on account region | Check the account's region before relying on `edit` task mode live |
| Cost runs away if keyframe iteration happens on Omni Flash instead of NB2 Lite | Budget gone in minutes | Enforce in code: the agent is only ever allowed to call `image_to_video`/`edit` on an already-approved keyframe, never mid-iteration |
| ~~IPM ceiling unknown~~ **Confirmed worse than "unknown": no hard ceiling observed, but severe silent latency degradation under any concurrency** | A demo firing several keyframes at once may hang unpredictably for 30–95s with no error to catch or explain it | `max_concurrent` scheduler already built; cap it low (3–5) by default and re-measure before raising it. Never demo live at 10+ concurrent without a rehearsed fallback |
| `interaction_id` is `None` on every image generation call (confirmed, this session) | `previous_interaction_id` keyframe branching in the repair story cannot work as designed over the current code path | Resolve before Phase 6: switch keyframe generation to `client.interactions.create()`, or drop interaction-chaining for images and rely on content-address branching alone (already implemented, already sufficient on its own) |

---

## 10. Open questions

1. Does `image_to_video` preserve the keyframe faithfully enough to make the gating thesis hold? *(Gate E — the whole project's central bet.)*
2. Is an `edit` turn actually faster than a fresh `image_to_video` call, or the same cost in wall-clock? *(Gate F.)*
3. What concretely happens at the 4th edit turn — rejection, silent reset, or degradation? *(Gate H.)*
4. How reliably does the continuity critic's deterministic tier (histogram diff) correlate with a human's sense of "that cut felt wrong"? Untested — Phase 4's fixture corpus is the first real signal.
5. Does `reference_to_video` (as opposed to `image_to_video`) offer a meaningfully different — perhaps more reliable — way to chain NB2 Lite output in? Not yet explored; worth a cheap comparison during Gate E.

---

## 11. References

**Platform** *(verified against Google's docs and the installed `google-genai==2.10.0` SDK directly, this session)*
- [Nano Banana 2 Lite & Omni Flash launch](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/) — states the NB2 Lite → Omni Flash chaining pattern outright
- [Gemini API video generation docs](https://ai.google.dev/gemini-api/docs/video) — model comparison, Omni Flash vs. Veo 3.1
- [Gemini Omni Flash API guide](https://ai.google.dev/gemini-api/docs/omni) — request shapes, multi-turn editing, reference-image syntax
- Installed SDK introspection: `google.genai.interactions.CreateModelInteractionParam`, `Task` literal (`text_to_video | image_to_video | reference_to_video | edit`), `client.interactions.create()` — confirmed present in `google-genai==2.10.0`, not assumed from docs alone

**Reference product**
- [Cardboard — AI video editor in your browser](https://www.usecardboard.com/) — UI/UX vocabulary borrowed; footage-ingestion engine explicitly out of scope here
- [Y Combinator — Cardboard](https://www.ycombinator.com/companies/cardboard)

**Method** *(carried over from `PRESSCHECK_PLAN.md`, unchanged)*
- *Self-Refine: Iterative Refinement with Self-Feedback.* `arXiv:2303.17651`
- *Reflexion: Language Agents with Verbal Reinforcement Learning.* `arXiv:2303.11366`
- *Portal UX Agent.* [`arXiv:2511.00843`](https://arxiv.org/pdf/2511.00843) — bounded generation, same constraint now applied to `ShotSpec`/`Timeline` instead of `SceneSpec`/`LocalizationPlan`

**Superseded**
- `PRESSCHECK_PLAN.md` — poster-localization thesis; the engine/draft/critic/agent-bar infrastructure it describes is inherited, its domain logic is not
