# Presscheck

**An agentic ad-localization canvas. One master ad fans out to N locales × M formats; the agent reviews all of them and hands back only the ones a human needs to see.**

Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`) for scene volume. Gemini 3 Flash for planning and judgment. tldraw for the canvas. Yjs for co-editing, with the agent as a first-class peer.

> This is a separate project from `DEVELOPMENT_PLAN.md` (Floor — on-device turn-taking). Nothing here touches that.

> **⚠️ Superseded by `SHOTLIST_PLAN.md`.** The hackathon direction shifted from poster localization to conversational video orchestration (NB2 Lite → Omni Flash). The engine architecture — draft DAG, critic split, agent bar, FastAPI/Astro/tldraw stack — carries forward; the domain logic on this page (locale × format fan-out, typographic critic, `ProofFrame`) is being replaced. Kept here as a reference for the patterns that survived the pivot.

---

## 1. The problem

A campaign ships to thirty markets in five formats. That is 150 pieces of artwork. Today they are made one of two ways: a designer makes 150 by hand, or a script crops one master 150 times and the results look cropped.

Neither works, for a reason that is not about tooling. **A 9:16 story and a 21:9 banner are not the same image at different sizes.** The subject sits somewhere else. The negative space is somewhere else. And the copy that fits the English master overflows the German one by 34%, flips direction in Arabic, and clips its own diacritics in Hindi.

So localization is not translation plus cropping. It is 150 small design decisions, and nobody has 150 design decisions' worth of attention.

---

## 2. The thesis

> **The canvas is a review surface, not a creation surface.**

The generation is the cheap part. At ~3.4¢ and ~4s per scene, generating 150 of them costs about $5 and takes under a minute wall-clock. That was not true a year ago and it is the whole reason this project is possible.

The expensive part is **knowing which of the 150 are wrong.** That is what the agent is for. Everything else in this document follows from that sentence.

---

## 3. What we claim, precisely

1. **Layered composition, not one-shot image generation.** The ad is a stack: generated scene, composited product, vector copy, pinned brand marks. Only the scene is generated. This is forced by the model's capability table (§4), and it turns out to be the right architecture anyway.
2. **Prompts are compiled from typed inputs, not written.** One LLM call converts intent to an IR; everything after is a pure function. See §6.
3. **Most QA is deterministic, not vision.** Text overflow, contrast ratio, and glyph clipping are arithmetic, not judgment. The LLM critic handles only the calls that are genuinely judgment. See §8 — this is the least obvious claim in the document and the one with the most leverage.
4. **Scene cache is keyed independently of copy.** Because copy is vector, editing a headline costs nothing. The image cost is paid per *scene*, not per *proof*. Drafts are immutable and content-addressed; the board points at them (§7).

### What we do NOT claim

- We are not beating Canva or Figma at design. We do one shape of job.
- Bounded generation (constraining an LLM to select and configure vetted components rather than emit free-form output) is prior art — see Portal UX Agent, `arXiv:2511.00843`. Cite it. Our contribution is the deterministic/LLM split of the critic, not the bounded-generation idea.
- Generator–critic loops are prior art: Self-Refine (`arXiv:2303.17651`), Reflexion (`arXiv:2303.11366`). We are applying a known pattern, not inventing one.
- We do not claim brand-consistent *generation*. Brand consistency lives in the pinned vector layer, precisely because the model cannot guarantee it (§4).

## 4. What the platform actually gives us

Verified against Google's docs, July 2026. The constraints are not the ones the marketing implies.

| | 3.1 Flash Lite (NB2 Lite) | 3.1 Flash (NB2) | 3 Pro |
|---|---|---|---|
| Object references | 14 | 10 | 6 |
| Character references | **0** | 4 | 5 |
| **Style references** | **0** | 3 | 0 |
| Resolutions | **1K only** | 512px / 1K / 2K / 4K | up to 4K |
| Search grounding | ✗ | ✓ | ✓ |
| Interleaved text+image out | ✗ | ✗ | ✓ |
| Cost / image (1K, standard) | $0.0336 | $0.067 | — |
| Cost / image (1K, batch) | $0.0168 | — | — |
| Latency (text→image) | ~4s stated; 5.4s observed on Replicate first-run | slower | slowest |

**The load-bearing row is style references: Lite has none.** You cannot hold a visual identity steady across 30 generations on Lite. Any pitch of "brand-consistent asset pipeline, all on Lite" fails on contact with the API.

The way out is the layered composition (§5). Brand consistency stops being a model problem and becomes a compositing problem, which is a solved one. Lite's 14 **object** references are exactly right for "same bottle, different scene."

**Other hard edges, all product-shaping:**

- Every image carries a **SynthID watermark**. Non-negotiable. Know this before someone asks about provenance.
- Aspect ratios are fixed: `1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`. That is your format list, handed to you.
- Multi-turn editing runs through an **Interactions API** with `previous_interaction_id` — not a replayed chat history. Store one interaction ID per proof from day one; retrofitting this is painful.
- The Interactions API supports **implicit caching only**. No explicit cache objects on the image path. Implicit kicks in at 4,096 tokens (3.5 Flash) / 2,048 (2.5 Flash).
- **Batch API is 50% off with up to 24h turnaround.** Useless in the live path. Correct for pre-warming the template library overnight.
- Image models are rate-limited in **IPM (images per minute)**, not TPM. Google does not publish the number — read it from the AI Studio dashboard. **This is the hard ceiling on fan-out width and we do not currently know it.**
- `thinking_level` is `minimal` (default) or `high`. Interim images from the thinking pass are not billed separately.

### Cost model

At list price, standard tier:

```
150 scenes × $0.0336        = $5.04   per campaign, cold
30 scenes  × $0.0336        = $1.01   per campaign, 6 locales × 5 formats
copy edit (vector only)     = $0.00
scene cache hit             = $0.00
```

Cost scales with **distinct scenes**, not with proofs. That is the architecture paying rent.

> **On the "$0.034 per 1,000 images" figure circulating in AI Overviews:** it is wrong by 1000×. Google bills 1,120 output tokens per 1K-resolution image at $30/1M image-output tokens → $0.0336 **per image**. Gate A settles this empirically in ten minutes; do not design around the wrong number.

---

## 5. Architecture

### The ad is a stack, not an image

| Layer | Source | Varies by locale | Cost |
|---|---|---|---|
| Scene / background | NB2 Lite, generated per (locale, format) | yes | $0.0336 |
| Product | composited PNG **or** object reference | no | $0 / included |
| Headline, body | vector text on canvas | yes | $0 |
| Wordmark, legal | vector, pinned | no | $0 |

**Product placement is a genuine fork:**

- *Composite a PNG layer* → occlusion is impossible by construction, product drift is impossible, QA burden drops to near zero. Looks pasted-on.
- *Generate into the scene via object reference* → photoreal lighting and reflections. Reintroduces occlusion and drift, and therefore requires the vision critic.

**Recommendation: composite for v1.** Take the object-reference path only for hero placements, where the extra QA is worth it. This decision determines how much of §8 you actually need to build.

### The orchestration loop

Four stages. Only two of them call an LLM.

```
                    ┌──────────────────────────────────────┐
   user intent ───► │  PLANNER   gemini-3-flash            │
                    │  structured output, JSON schema      │
                    │  → LocalizationPlan                  │
                    └──────────────┬───────────────────────┘
                                   │  (deterministic from here)
                    ┌──────────────▼───────────────────────┐
                    │  EXECUTOR   no LLM                   │
                    │  fan out (locale × format)           │
                    │  content-addressed scene cache       │
                    │  IPM-aware token-bucket scheduler    │
                    │  → NB2 Lite, N parallel              │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │  CRITIC                              │
                    │   tier 1: deterministic  (§8)  ~0ms  │
                    │   tier 2: gemini-3-flash vision      │
                    │           montage, 1 call for N      │
                    │  → Finding[]                         │
                    └──────────────┬───────────────────────┘
                                   │  only for findings
                    ┌──────────────▼───────────────────────┐
                    │  REPAIR                              │
                    │  deterministic fixes applied         │
                    │  scene fixes → previous_interaction_id│
                    │  unresolved → human, on canvas       │
                    └──────────────────────────────────────┘
```

The planner emits a **schema-validated `LocalizationPlan`**, never free-form instructions. This is bounded generation (`arXiv:2511.00843`): the model *selects and configures* from a fixed inventory, it does not author. Gemini's structured-output support covers the schema subset we need (`enum`, `items`, `minItems`/`maxItems`, `minimum`/`maximum`, `required`), and composes with function calling. Deeply nested schemas get rejected — keep it flat.

Everything between planner and critic is a **pure function**. No model decides how many images to make, or which cell gets which prompt. That is arithmetic over the plan, and it is where reliability comes from.

### The agent is a Yjs peer

The orchestrator opens its own Yjs document against the same sync stream as the humans. It has a cursor, presence, and its edits land through the same CRDT merge path as anyone else's.

The consequence that matters: a user can drag a shape while the agent is repairing another cell, and nothing clobbers. Without this, "collaborate" is a chat box next to a canvas.

---

## 6. The prompt engine

**The prompt is compiled, not written.**

Nobody types a prompt into this system. A prompt is the output of a pure function over typed inputs, and that is what makes 150 of them tractable rather than 150 opportunities to be inconsistent.

### It is a compiler, deliberately

```
NL intent ──parse──► SceneSpec (IR)         [LLM — once, at the boundary]
                         │
 BrandSpec ──┐           │
 LocaleSpec ─┼─resolve───┤                  [pure]
 FormatSpec ─┘           │
                         ▼
                   ResolvedSpec
                         │
                       lower                [pure — template vN]
                         ▼
                    PromptText
                         │
                        link                [attach object references]
                         ▼
                        emit ──────► NB2 Lite
```

The model appears **exactly once**, at `parse`, turning natural language into a typed IR. After that no model touches the prompt. Everything downstream is a pure function: same inputs → same string → same cache key → same image.

### The IR

Flat, because Gemini rejects deeply nested schemas (§4):

```python
class SceneSpec:                   # planner emits this, schema-validated
    subject: str
    setting: str
    time_of_day: Literal["dawn", "day", "dusk", "night"]
    palette: list[str]             # ≤ 4 hex
    mood: str
    lens_mm: int                   # 24..135
    lighting: Literal[...]
    excludes: list[str]            # ≤ 6
    object_refs: list[AssetId]     # ≤ 14 — Lite's ceiling
```

Deliberately **not** in the IR: aspect ratio, negative space, copy. Those are *resolved*, never authored.

### The trick: the layout compiles itself into the prompt

The copy box is vector, so its geometry is known before the image exists. `resolve` derives the negative-space directive from it:

```python
def negative_space(copy_box, fmt) -> Directive:
    region = quantize(copy_box, fmt)          # → "upper-left third"
    return Directive(region=region,
                     luminance="low",
                     subject_bias=opposite(region))
```

`lower` then emits `"…compose with the upper-left third in shadow, subject weighted lower-right…"`.

Two consequences, both large:

1. **Arabic gets a different prompt than German, with no model involved.** RTL moves the copy box right; `resolve` moves the negative space right; the prompt changes. Deterministically, every time.
2. **The deterministic contrast and negative-space checks (§8) pass by construction.** We are not detecting bad composition after the fact. We are asking for good composition and then verifying we got it.

### Why compile rather than template-string

- **Diffable.** A quality regression bisects to a template commit.
- **Testable.** Snapshot-test `lower()`. Two hundred golden prompts, zero API calls, milliseconds.
- **Cacheable.** `cache_key = hash(resolved_spec, template_version, model_id)`. Bump the template and the cache invalidates correctly, which is the behavior you want when you improve a prompt.
- **Auditable.** When a client asks why an ad looks the way it does, you show them the IR — not a paragraph somebody typed once and forgot.

Prompt templates are versioned artifacts in the repo, reviewed like code.

---

## 7. The draft system

At 3.4¢ per image, **a draft is cheaper than a decision.** That inverts the usual economics of a design tool, and the data model should say so out loud.

### Two histories, deliberately not merged

This is the central design decision. Conflating these is the most common way tools of this shape rot.

| | Board history | Draft history |
|---|---|---|
| Shape | CRDT (Yjs) | content-addressed DAG |
| Mutability | mutable | **immutable** |
| Granularity | continuous, per keystroke | discrete, per generation |
| Concurrency | multiplayer merge | none needed — content addresses collide safely |
| Undo | `Y.UndoManager`, scoped by origin | you never undo a draft; you point somewhere else |

The board **points at** a draft. It never contains one.

**Origin-scoped undo is what makes the agent-as-peer honest.** Yjs's `UndoManager` tracks transaction origins. Tag agent edits with an agent origin, and the user's ⌘Z undoes only the user's own edits — never the repair the agent is performing concurrently in another cell. Without this, co-editing is a demo lie: the first undo nukes the other party's work.

### The model

```python
class Draft:                        # immutable
    id: DraftId                     # == cache_key from §6
    prompt_hash: str
    template_version: str
    model_id: str
    image_ref: BlobRef              # content-addressed
    interaction_id: str | None      # previous_interaction_id, for repair
    parent: DraftId | None          # repair branches — a tree, not a list
    author: Literal["agent", "user"]
    findings: list[Finding]
```

`parent` makes this a **tree**. Repair via `previous_interaction_id` is a branch, not an overwrite — so "the agent's fix was worse, go back" is free, and both versions stay inspectable side by side on the canvas.

`id == cache_key` means two cells that resolve to the same spec share one draft, one blob, one API call. Scene reuse within a locale row is common; you get it for nothing.

### Inputs are versioned too

Every user input creates a `Turn`:

```
Turn { input, plan: LocalizationPlan, drafts_created: [DraftId] }
```

Because the pipeline in §6 is pure, **rewinding and editing an input three turns back is cheap.** Recompile. Most cache keys are unchanged, so most cells cost nothing; only cells whose `ResolvedSpec` actually moved regenerate.

The extreme case is the good one: **edit a headline and the image cost is exactly zero**, because copy is vector and copy is not in the cache key.

> Purity is what makes time-travel affordable. It is the same reason the executor has no LLM in it.

### Cost-aware drafting

Do not generate *k* variants everywhere. Generate one, run the critic, then **spend variants where the findings are**:

```
cold fan-out     30 cells × 1 draft   = 30 images = $1.01
critic flags 5
repair            5 cells × 3 drafts  = 15 images = $0.50
                                        ────────────────
                                                    $1.51  per campaign
```

Naive *k*=3 everywhere costs $3.02 and spends two thirds of it on cells that were already fine.

**Drafts follow findings.** That sentence is the entire policy.

---

## 8. The critic — the interesting part

The naive design shows every proof to a vision model and asks "is this okay?" That is slow, expensive, and unreliable at exactly the checks that matter most.

**Three of the five failure modes are arithmetic.** We own the vector text layer, so we own its geometry:

| Check | How | LLM needed |
|---|---|---|
| Headline overflows safe area | measure laid-out text box vs. artboard bounds | **no** |
| Contrast below WCAG AA | sample scene luminance under the copy box, compute ratio | **no** |
| Glyph clipping (Devanagari matra, Arabic dots) | font ascent/descent metrics vs. line-height | **no** |
| Insufficient negative space where copy goes | luminance variance in the copy region | **no** |
| Product occluded by generated content | — | **yes** (only if object-ref path) |
| Culturally wrong / brand-unsafe / uncanny scene | — | **yes** |

So the vision critic's job shrinks to judgment calls, and it can batch: **one call over a montage of N proofs** rather than N calls. Gate C decides whether montage batching holds accuracy; if it does not, fall back to per-proof on the ~20% that reach tier 2.

This inverts the naive cost curve. The critic is nearly free, runs in milliseconds for most checks, and — because arithmetic does not hallucinate — never reports a contrast ratio that isn't real.

**The prompt-side corollary:** if the scene prompt *instructs* negative space per format ("compose with the left third at low luminance, subject weighted right"), the deterministic contrast and negative-space checks pass by construction. The cheapest QA is the QA you design out.

---

## 9. Model routing

Route by capability, never by vibe.

| Job | Model | Why |
|---|---|---|
| Scene volume | `gemini-3.1-flash-lite-image` | 3.4¢, ~4s, 1K, 14 object refs |
| Style-locked master | `gemini-3.1-flash-image` | only tier with style references |
| Hero / print export | `gemini-3-pro-image` | 4K, interleaved output |
| Planner + repair reasoning | `gemini-3-flash` | $0.50/$3.00 per 1M |
| Vision critic | `gemini-3-flash` | same |
| Hard layout reflow (fallback) | `gemini-3.5-flash` | $1.50/$9.00 — 3× the cost |

**Use `gemini-3-flash`, not `3.5-flash`, for the loop.** The agent sends canvas screenshots every turn, so image *input* tokens dominate, and 3× on input is real money at 150 cells. Escalate to 3.5 Flash only where the cheaper model visibly fails, and measure that it does.

### Optimization levers, in order of payoff

1. **Content-address the scene cache.** Key on `hash(locale, format, scene_spec)` — deliberately *excluding* copy. Editing a headline is then free. This is the single largest cost lever and it falls out of the layered architecture for nothing.
2. **Design the QA out** (§6, §8). Prompt for negative space; don't detect its absence.
3. **`thinking_level: minimal`** on all scene generation. Escalate to `high` only on repair, where the model has a specific failure to reason about.
4. **Montage the vision critic.** One call per N proofs, pending Gate C.
5. **Batch API for the template library.** 50% off, overnight, never live.
6. **Implicit caching** on the planner's system prompt. Keep it above 4,096 tokens so it caches, and stable so it stays cached. Watch `usage.total_cached_tokens`.
7. **IPM-aware scheduler.** `asyncio.Semaphore` + token bucket sized to the real IPM ceiling. Not Celery — this is one process with a concurrency limit.

---

## 10. Tech stack

| Layer | Choice | Why, and what it costs |
|---|---|---|
| Canvas | **tldraw** (React) | Its agent starter kit already solves canvas→LLM serialization: `BlurryShape` (viewport overview), `FocusedShape` (full props), `PeripheralShapeCluster` (off-screen, collapsed to bounds + counts). That last one is what lets an agent reason about a 150-cell sheet without drowning in tokens. Streams shape mutations incrementally. **Costs $6,000/yr commercial; will not run in production without a license key. 100-day free trial, no card. Hobby license carries a watermark.** |
| Sync | **Yjs** via Hocuspocus; `pycrdt` on the server | Agent as server-side peer. Liveblocks is the managed alternative and markets explicitly to agent use cases. |
| Orchestrator | **Python 3.12 + FastAPI**, `uv` | The repo already has `uv`, py3.12, and `google-genai` installed. `pycrdt` gives the server a real Yjs peer. |
| Client | **Next.js + React** | tldraw is React-only. |
| Image store | object store, content-addressed by scene hash | The cache from §9.1 *is* the storage layer. Draft blobs are immutable, so no invalidation. |
| Metadata | Postgres | campaigns, proofs, `previous_interaction_id`, findings |
| Queue | `asyncio` semaphore + token bucket | Do not reach for a broker. One process, bounded concurrency. |

**The tldraw trade, stated plainly.** It is an infinite whiteboard; ads are fixed artboards. You close that gap with custom shape utils and bounded frames. That is a smaller job than rebuilding tldraw's agent plumbing on Fabric.js — but the $6k/yr is real, and the alternative (Fabric + hand-rolled agent context) is a large body of work you would rather spend elsewhere. **Take the free trial, and set a reminder before it lapses.**

Rejected: **Polotno** — closed source, $199/mo floor, priced per *editor load*, which is hostile to a demo judges click through repeatedly. **Fabric.js / Konva** — the layer beneath a design tool, not the tool; you build toolbars, selection, export, and the whole agent-context layer yourself.

---

## 11. Phase 0 — four gates. Nothing else starts.

All four are cheap. All four can kill or reshape the project. Run them first.

**Gate A — what does an image actually cost, and how many can we make per minute?**

Generate one 1K image. Read `usage_metadata` off the response. Then fire 60 in parallel and find where it 429s.

- Verify: `candidates_token_count` ≈ 1,120 → $0.0336/image confirmed. Record the observed IPM ceiling.
- Why it matters: the IPM ceiling sizes the scheduler and caps how wide the demo's fan-out can go. **We currently do not know this number.**

**Gate B — does a scene hold together across five aspect ratios with only object references?** ☠️

Generate the same scene spec at 1:1, 4:5, 9:16, 16:9, 21:9 with an object reference for the product and **no style reference** (Lite has none). Compare.

- Verify: the five read as one campaign, not five campaigns. Judge by eye, then by a human who has not seen the prompt.
- **If scenes drift badly across formats, the "one campaign, N formats" promise dies on Lite.** Fall back to: generate the master on 3.1 Flash *with* style references, then use Lite only for cheap variants within a locked format. Smaller volume story, still real.

This is the highest-risk unknown in the project, and it exists only because of the missing style-reference row in §4.

**Gate C — can the critic be batched?**

Render a montage of 12 proofs, 3 of them deliberately broken in the judgment-only ways (occlusion, uncanny scene). Ask `gemini-3-flash` to identify the broken ones, with structured output.

- Verify: finds all 3, ≤1 false positive. Then compare against 12 individual calls.
- If montage accuracy is poor, fall back to per-proof calls on the ~20% that reach tier 2. Costs more; does not kill anything.

**Gate D — is undo origin-scoped across processes? ✅ PASSED**

Two peers on one Yjs doc: a real browser-runtime client (Node + `yjs` + `y-websocket`'s `WebsocketProvider`) and a `pycrdt` agent in a separate Python process, synced through a `pycrdt.websocket.WebsocketServer` over a real WebSocket. Both edit different cells. Each side undoes in turn.

- Verify: the user's edit reverts. **The agent's edit does not.** Then reverse the roles. — **Confirmed, both directions, 8/8 checks green.** `Y.UndoManager` (JS) tracking `trackedOrigins: {"user"}` leaves a remote pycrdt peer's `"agent"`-origin edit untouched; `pycrdt.UndoManager` tracking `include_origin("agent")` leaves a remote JS peer's `"user"`-origin edit untouched. Origin scoping survives the process boundary in both directions.
- Implementation: `gates/gate_d_undo_origin.py` orchestrates `gates/gate_d/server.py` (sync relay), `gates/gate_d/agent.py` (Python peer, both `produce` and `undo` modes), and `web/scripts/gate-d-browser.mjs` (JS peer). Two non-obvious fixes needed along the way: `handle_sync_message` expects the outer `YMessageType` envelope byte already stripped (mirrors `YRoom.serve`'s own handling), and `WebsocketServer` needs `auto_clean_rooms=False` or room state is deleted the moment a peer disconnects — silently desyncing the next peer that connects.
- Co-editing (§7) is **not decorative**. Phase 7 can proceed on true concurrency rather than falling back to turn-taking.

---

## 12. Phases

**Phase 1 — the stack, cold.**
Next.js + tldraw with custom `ProofFrame` shape utils. Hocuspocus + Yjs. Static proofs, no generation. Agent cursor renders and moves. Draft DAG and `Turn` log exist and are written to, even though nothing generates yet.
*Verify:* two browsers, two cursors, no clobbering when both drag at once. ⌘Z in one tab leaves the other tab's edits alone.

**Phase 2 — the prompt engine.**
`SceneSpec` IR, `resolve`, `lower`, `link`. Negative-space derivation from the copy box. Template `v1`, versioned in-repo.
*Verify:* 200 golden prompts snapshot-test green with **zero API calls**. `compile()` called twice with identical inputs produces byte-identical output. `ar-EG` and `de-DE` at the same format produce *different* negative-space directives, with no model in the loop.

**Phase 3 — the executor.**
Content-addressed scene cache keyed on `(resolved_spec, template_version, model_id)`. IPM-aware scheduler. Fan out a hardcoded plan to 30 cells against NB2 Lite.
*Verify:* 30 scenes, cold, under 90s wall-clock and under $1.10. Re-run: **0 API calls, $0, cache hit on all 30.** Then change only the headline: still 0 API calls.

**Phase 4 — the typographic engine and the deterministic critic.**
Text metrics, luminance sampling, WCAG ratio, glyph-box checks. No LLM.
*Verify:* on a corpus of 30 proofs with 8 known-broken cells, catch all 8 arithmetic failures with zero false positives. **Zero, not few — arithmetic does not get to be approximately right.**

**Phase 5 — the planner.**
`gemini-3-flash`, structured output, `LocalizationPlan` + `SceneSpec` schema. Flat; deep nesting is rejected.
*Verify:* 20 consecutive plans validate against the schema without a retry. Any free-form output is a bug.

**Phase 6 — drafts, repair, and the vision critic.**
Draft tree with `parent` edges. Tier-2 montage critic. Repair via `previous_interaction_id`, branching rather than overwriting. Cost-aware drafting: one draft cold, three on flagged cells.
*Verify:* end-to-end, a campaign of 30 goes from master to "5 flagged, 25 clear" with no human in the loop, for **under $1.60**. Rejecting the agent's repair restores the prior draft with 0 API calls. **Then check the 25 by hand** — the number that matters is how many "clear" proofs were actually broken.

**Phase 7 — co-editing and time travel.**
Human and agent repairing different cells simultaneously. Agent presence, review queue, ship action. Rewind a `Turn`, edit its input, re-run.
*Verify:* the demo in §13 runs twice in a row without a reload. Editing a headline three turns back costs **$0**.

---

## 13. The demo (90 seconds)

One master ad. Type "fan out to 6 locales × 5 formats." Thirty artboards populate the sheet in under a minute — you can watch them land.

The agent sweeps the sheet. Five come back flagged: German overflows at 9:16, Arabic's RTL flip collides with the wordmark, Portuguese has foliage across the product, Japanese fails contrast, Hindi clips a matra.

You fix two on the canvas while the agent fixes the other three. Both cursors visible. Then: ship 30.

The number to say out loud is not thirty. It is **five** — because the product is not that it made thirty ads. It's that it read all thirty and only asked you about five.

---

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Gate B fails** — scenes drift across aspect ratios without style refs | The volume story dies on Lite | Master on 3.1 Flash with style refs; Lite for in-format variants only |
| **IPM ceiling is low** (unknown) | Fan-out is serial, demo drags | Gate A, before anything else. Shrink the demo matrix; pre-warm via Batch API |
| **tldraw license** — $6k/yr, key required in prod | Blocks anything past the trial | Take the trial now; decide before it lapses. Fabric.js is the escape hatch |
| **Vision critic unreliable** | Triage — the whole thesis — is untrustworthy | §8 moves most checks to arithmetic precisely for this reason. Gate C sizes the residual |
| ~~Undo is not origin-scoped~~ | ~~Agent repair and user ⌘Z destroy each other~~ | **Retired — Gate D passed.** Verified across a real process boundary, both directions |
| Prompt template churn invalidates the whole cache | Every campaign regenerates on a template bump | Correct behavior, but expensive. Pin `template_version` per campaign; migrate deliberately |
| **Deterministic critic has false negatives** | "Clear" proofs ship broken. Worst possible failure | Phase 3 demands *zero* false positives; Phase 5 hand-checks the 25 "clear" |
| Deeply nested `LocalizationPlan` schema rejected | Planner unusable | Keep the schema flat. Validate against the API early, not at integration |
| Copy is machine-translated and wrong | Ships a mistranslation | We do not translate. Copy is an input, human-approved, per locale |
| SynthID watermark on every asset | Client provenance questions | Know it, disclose it, don't be surprised by it |
| Someone designs around "$0.034 / 1,000 images" | Unit economics off by 1000× | Gate A. Ten minutes |

---

## 15. Open questions

1. What is the actual IPM ceiling on `gemini-3.1-flash-lite-image` at our tier? *(Gate A — currently unknown, and it sizes everything.)*
2. Does object-reference-only scene generation hold identity across aspect ratios? *(Gate B — the project's biggest bet.)*
3. Composite the product as a layer, or generate it into the scene? *(Determines whether §8's vision tier is needed at all.)*
4. Does montage batching preserve critic accuracy? *(Gate C.)*
5. Does implicit caching actually fire on the planner's system prompt, and what discount does it carry? Docs state the 4,096-token threshold but not the cost reduction.
6. Is `previous_interaction_id` durable across processes, or bound to a session? Affects whether repair can be queued — and whether a `Draft.parent` edge survives a restart (§7).
7. ~~Does `Y.UndoManager` origin scoping hold when the agent peer is a separate `pycrdt` process rather than a browser tab?~~ **Answered — yes, both directions.** *(Gate D, passed.)*
8. How aggressively can `resolve` quantize the copy box into negative-space regions before the directive stops steering the model? Three regions? Nine? *(Measured in Phase 2.)*

---

## 16. References

**Platform** *(all verified against docs, July 2026)*
- [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation) — model tiers, reference-image limits, aspect ratios, SynthID
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) — $0.0336/1K-resolution image, standard
- [Nano Banana 2 Lite launch](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/) — "4 seconds", "$0.034 per 1K-resolution image"
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — IPM for image models; values only in AI Studio
- [Context caching](https://ai.google.dev/gemini-api/docs/caching) — Interactions API is implicit-only; 4,096-token threshold
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) — supported JSON Schema subset; deep nesting rejected

**Canvas & collaboration**
- [tldraw agent starter kit](https://tldraw.dev/starter-kits/agent) — `BlurryShape` / `FocusedShape` / `PeripheralShapeCluster`, streaming shape mutation
- [tldraw licensing](https://tldraw.dev/pricing) · [license terms](https://tldraw.dev/community/license) — $6,000/yr, key required in production
- [AI agents as CRDT peers with Yjs](https://electric.ax/blog/2026/04/08/ai-agents-as-crdt-peers-with-yjs) — server-side agent peer, cursor, presence
- [Liveblocks](https://liveblocks.io/) — managed alternative

**Method** *(first two verified this session; last two cited from memory — check before publishing)*
- *Generative UI: LLMs are Effective UI Generators.* [`arXiv:2604.09577`](https://arxiv.org/abs/2604.09577) — matches human experts ~50% of the time; explicitly brackets its result with "when ignoring generation speed." Releases **PAGEN**, a benchmark we could evaluate the planner against.
- *Portal UX Agent.* [`arXiv:2511.00843`](https://arxiv.org/pdf/2511.00843) — **bounded generation**: compile NL intent into schema-validated compositions over a fixed component inventory. The core constraint of §5–6.
- *Self-Refine: Iterative Refinement with Self-Feedback.* `arXiv:2303.17651` — the generator→critic→repair loop.
- *Reflexion: Language Agents with Verbal Reinforcement Learning.* `arXiv:2303.11366` — same family; prior art for §5's repair stage.

**Rejected**
- [Polotno SDK pricing](https://polotno.com/sdk/pricing) — $199/mo, per-editor-load
- [Open-source design editor SDKs compared](https://img.ly/blog/open-source-design-editor-sdks-a-developers-guide-to-choosing-the-right-solution/)
