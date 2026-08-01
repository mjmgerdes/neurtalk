# Demo runbook (2.5 min pitch)

## Pre-flight (do BEFORE judging starts)
- [ ] Ollama running with the hosted origin allowed (required if demoing from the github.io URL; harmless otherwise):
      `OLLAMA_ORIGINS="https://mjmgerdes.github.io" ollama serve`
      (run directly in a terminal — the brew service doesn't start reliably). Verify: `curl localhost:11434/api/tags`
- [ ] Warm the model once: hit **Read scene** a single time so gemma4 is resident (first call pays load cost)
- [ ] `npm run dev` → localhost:5173, camera + mic allowed
- [ ] Sit where you'll present, click **Calibrate neutral**
- [ ] Check the two badges: `Gemma local · gemma4` green, `face tracked` green
- [ ] Volume up. Test one urgent button aloud.
- [ ] Do NOT switch Ollama models during the demo (model swap caused a transient failure in testing)

## Script

**0:00 — Problem (say it plainly)**
"ALS takes your speech and your hands, but not what you want to say. Today's tools make you rebuild every sentence — about 40 selections through whatever movement you have left. NeurTalk flips that: the environment supplies context, my personal bank supplies identity, and I supply only intent."

**0:20 — Mine my semantics** (Communication map tab, or onboarding step 2)
Upload the sample MP3 → "transcribe & map" (Whisper, on-device) → transcript appears → "Extract semantics with Gemma" → chips appear: ✦ "I want that damn ___", quirks, people. "Gemma just learned how *I* talk — not how an assistant talks. Every memory here is editable and deletable, and there's a log of every piece of context I've contributed."

**0:40 — The moment** (Talk tab)
"Now imagine my speech and hands are gone." If not already linked from onboarding, hit **Connect phone (glasses)**, scan the QR, tap Start streaming — your phone's view appears on screen ("in the real product this is smart glasses"). Point the phone at the staged scene (person + mug). Type/keep "Do you need anything?" → **Read scene**.
While it thinks: "A camera frame is going to Gemma running ON this laptop — nothing leaves the device. It reads the scene, crosses it with my bank, and proposes three genuinely different intents."

**1:10 — Select through the glasses**
Hold the phone up in landscape — the three options float over the live view like an AR HUD, and one of them reuses your mined expression filled from the scene ("I want that damn blue cup"). Tilt left/right → highlight moves on both screens. Nod the phone → confirm state. "Nothing is spoken until I deliberately confirm — context proposes, the person disposes." Nod again → the laptop speaks it in the banked voice. (Laptop head-tracking works as the alternate access method if the room's too chaotic.)

**1:30 — Learning**
Edit a candidate: "bring" → "grab". Point at the toast: "Preference learned. Next generation will phrase it my way."

**1:50 — The architecture point**
Switch access dropdown: head → keys → single switch (let it auto-scan once, press Space).
"Same brain, different body. ALS progression varies — the intelligence layer accepts whichever reliable movement remains. Head control is one adapter, not the product."

**2:10 — Close**
"Urgent messages never touch the model. Everything runs on-device because a camera pointed at your family cannot be a cloud product. We're not preserving a recording of someone — we're preserving their ability to author what they say."

## Failure fallbacks
- Head tracking flaky in venue light → switch dropdown to **keys (1/2/3 + Enter)**, keep narrating the same story
- Gemma slow → keep talking through the "on-device" explanation; latency is the privacy price and you can say so honestly
- Gemma down → badge goes amber, app auto-uses labeled demo candidates; the selection demo still works
- Total app failure → hosted URL https://mjmgerdes.github.io/neurtalk/ (fallback mode) from any browser
