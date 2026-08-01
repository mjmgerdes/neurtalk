# NeurTalk — Kaggle Writeup Draft

> Paste into the Kaggle Writeup editor. Word count ~1,200 (limit 1,500). Fill in the bracketed bits after the live demo run. Select track before submitting.

**Title:** NeurTalk
**Subtitle:** On-device Gemma turns one head-turn and a nod into a sentence that sounds like *you* — communication for people losing speech and movement.
**Track:** On-Device Private Health Tools *(alternate: Voice for Care — accessibility)*

---

## The problem

ALS and similar conditions take speech and hand control, but not the need to be heard. Today's AAC (augmentative and alternative communication) tools ask a person to rebuild every sentence from letters or tiles — roughly 40 painstaking selections for one sentence, through whatever movement remains. Voice banking preserves what someone sounds like, but not how they phrase things, who matters to them, or their humor. People don't just lose their voice. They lose their authorship.

NeurTalk inverts the workload. The environment supplies context. A personal communication bank supplies identity. The user supplies only intent: one head direction plus one nod. Nothing is ever spoken without their deliberate confirmation — **context proposes, the person disposes.**

## What I built (solo, in one day)

A working browser prototype with the full loop (voice + audio context + semantic mining onboard; a phone stands in for smart glasses, streaming its camera to the interface over WebRTC and rendering the three candidates as an AR-style HUD over the wearer's view — tilting the phone selects, a nod confirms):

1. **Preserve** — an onboarding flow records a natural voice sample and seeds a personal communication bank: people (Sarah, daughter), objects (the blue mug), phrasing habits ("says grab, not bring"), and approved phrases. Stored entirely on-device; every memory is reviewable, editable, and deletable in a transparent Communication Map — no opaque "how well we know you" score.
2. **See** — a camera frame goes to Gemma 4 running locally. It returns structured JSON: people present, objects visible, location, activity. Raw imagery is never stored.
3. **Propose** — Gemma 4 crosses that scene with the personal bank and generates exactly three candidate messages with *meaningfully different intents* (a request, an alternative, a decline) — never three paraphrases — phrased the way this specific person talks.
4. **Choose** — MediaPipe Face Landmarker (in-browser, on-device) tracks head pose: turn left/center/right to highlight, nod to select, nod again to speak. Average time from options appearing to sentence spoken in my testing: [X]s, versus ~40 selections on a letterboard.
5. **Learn** — editing a candidate ("bring" → "grab") is captured as an explicit preference, shown to the user, and injected into future Gemma prompts. The bank learns from approved selections and edits — not from passively listening.

A Communication History screen records (deletable, on-device) what was spoken, by which access method, and how long it took, and generates a plain-text Communication Access Report the user can *choose* to share with their SLP or care team. Descriptive only — no diagnoses, no clinical notes.

## How Gemma 4 is used — and why it must be on-device

Gemma 4 is the reasoning core, not a garnish. Three distinct inference passes:

- **Semantic mining pass** (`extractSemantics`): the user's real speech — uploaded MP3s/videos or recordings, transcribed on-device by Whisper running in the browser — goes to Gemma 4, which extracts characteristic expression *templates* ("I want that damn ___"), style quirks, and people. Those templates are re-filled from the live scene, so a mined "I want that damn ___" plus a visible blue cup becomes the candidate "I want that damn blue cup."

- **Vision pass** (`src/llm/gemma.ts → describeScene`): multimodal Gemma 4 converts a camera frame — from the phone-as-glasses stream when connected — into structured scene JSON. Strict-JSON output via Ollama's format constraint.
- **Language pass** (`generateCandidates`): Gemma 4 receives the identity profile, relationship graph, approved phrases, correction history, scene JSON, and what was just said to the user — and must return three intent-distinct candidates in the user's own register.

All inference runs through Ollama on localhost. This is not a deployment preference; it is the product. A continuous camera feed of someone's home, family, and caregivers — pointed at a person with a progressive illness — is among the most sensitive data streams imaginable. It cannot go to a cloud API. On-device Gemma is what makes this product *possible*, not just cheaper.

The personalization is prompt-engineered rather than fine-tuned by design: the "model" of the person lives in an inspectable, user-editable bank, and moves with them across devices and access methods.

## Why the technical choices were right

**Access-method abstraction.** ALS progression varies; head control is not always the last ability preserved. So the selection layer reduces every input to two primitives — `highlight(slot)` and `confirm()` (`src/input/useSelection.ts`). The demo ships three interchangeable adapters: head pose, keyboard, and single-switch auto-scanning. The brain is provably not coupled to one body.

**Landmark-geometry head pose over Euler-matrix extraction.** I estimate yaw/pitch from face-landmark ratios with a one-click neutral calibration, instead of decomposing the transformation matrix. Less elegant, but calibratable per person and per camera in seconds — which is what an accessibility interface (and a live demo) actually needs.

**Deliberate two-stage confirmation.** Turn-to-highlight, nod-to-select, nod-again-to-speak. A false utterance in an AAC context is a real harm, so selection and authorization are separate physical acts.

**Safety-critical messages bypass the model.** Urgent messages ("I'm in pain") are fixed, user-approved buttons that never touch generative inference.

**Graceful degradation.** If local inference is down, the interface runs on clearly-labeled demo candidates — the access-method demo never blocks on the model, and the UI badge always shows which mode you're in.

## Challenges in the sprint

- **Intent diversity.** Early prompts returned three paraphrases of the same request. The fix was making intent-distinctness an explicit output contract (each candidate carries an `intent` field) rather than a stylistic wish.
- **Latency vs. faithfulness.** Full-profile generation on gemma4 runs ~6–12s warm on my laptop. I kept the larger model for quality, pinned it resident (`keep_alive`), capped generation length so the demo can't stall, and made the UI communicate progress honestly.
- **Nod detection.** A nod is a downward pitch crossing *and* a quick return — dwell alone misfires when someone looks down. The state machine requires the round trip within 700ms, with thresholds exposed for live tuning.

## Honest limitations

The "banked voice" currently uses the OS speech voice — on macOS this can be a Personal Voice trained fully on-device, which is the honest, privacy-preserving version of voice cloning; a 15-second sample cannot truthfully promise a permanent clone. The onboarding recording seeds a demo profile rather than being mined automatically. Eye-gaze and glasses form factors are represented by the access-method abstraction, not implemented. The demo profile is synthetic; no real patient data anywhere.

## Scope compliance

Decision-support and accessibility only: no diagnosis, no treatment, no clinical claims. Synthetic data only. The user authors every utterance.

## Links

- Public repo: https://github.com/mjmgerdes/neurtalk
- Live demo: https://mjmgerdes.github.io/neurtalk/ — head-tracking selection runs fully in-browser; without a local Ollama it uses clearly-labeled fallback candidates. Clone + `ollama pull gemma4` for full local inference.
- Demo video: [optional]
