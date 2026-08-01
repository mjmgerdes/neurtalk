# Demo runbook (2.5 min pitch)

## Pre-flight (do BEFORE judging starts)
- [ ] `ollama serve` running (run directly in a terminal — the brew service doesn't start reliably). Verify: `curl localhost:11434/api/tags`
- [ ] Warm the model once: hit **Read scene** a single time so gemma4 is resident (first call pays load cost)
- [ ] `npm run dev` → localhost:5173, camera + mic allowed
- [ ] Sit where you'll present, click **Calibrate neutral**
- [ ] Check the two badges: `Gemma local · gemma4` green, `face tracked` green
- [ ] Volume up. Test one urgent button aloud.
- [ ] Do NOT switch Ollama models during the demo (model swap caused a transient failure in testing)

## Script

**0:00 — Problem (say it plainly)**
"ALS takes your speech and your hands, but not what you want to say. Today's tools make you rebuild every sentence — about 40 selections through whatever movement you have left. NeurTalk flips that: the environment supplies context, my personal bank supplies identity, and I supply only intent."

**0:20 — Show the bank** (Communication map tab)
"This is everything it knows about me — my people, my objects, how I phrase things. Every memory is editable and deletable. It learns from my choices, not from listening."

**0:40 — The moment** (Talk tab)
"Now imagine my speech and hands are gone." If not already linked from onboarding, hit **Connect phone (glasses)**, scan the QR, tap Start streaming — your phone's view appears on screen ("in the real product this is smart glasses"). Point the phone at the staged scene (person + mug). Type/keep "Do you need anything?" → **Read scene**.
While it thinks: "A camera frame is going to Gemma running ON this laptop — nothing leaves the device. It reads the scene, crosses it with my bank, and proposes three genuinely different intents."

**1:10 — Select with your head**
Turn head → highlight moves. Nod → confirm screen. "Nothing is spoken until I deliberately confirm — context proposes, the person disposes." Nod again → it speaks.

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
