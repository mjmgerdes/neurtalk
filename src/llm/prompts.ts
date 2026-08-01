import type { Profile, SceneContext } from "../types";

export function scenePrompt(): string {
  return `You are the perception layer of an assistive communication device for a person who cannot speak.
Look at this image and describe the scene as strict JSON with exactly these keys:
{
  "people_present": [names or short descriptions of visible people, e.g. "woman in green shirt"],
  "objects_visible": [notable objects a person might want or refer to],
  "location": "one or two words, e.g. kitchen",
  "activity": "one short phrase describing what is happening"
}
Only output JSON. Do not guess names you cannot know. Do not diagnose or infer anything medical.`;
}

export function candidatesPrompt(profile: Profile, ctx: SceneContext, recentPrompt?: string): string {
  const corrections = profile.corrections
    .map((c) => `- prefers "${c.chosen}" over "${c.rejected}" (${c.learned})`)
    .join("\n");
  return `You generate message CANDIDATES for ${profile.style.preferredName}, who has limited speech and movement.
You never speak for them. You propose; they choose. Generate exactly 3 short spoken-style messages they might want to say RIGHT NOW.

THEIR IDENTITY (use their voice, not a generic assistant voice):
- Tone: ${profile.style.tone}
- Habits: ${profile.style.quirks.join("; ")}
- Approved phrases that sound like them: ${profile.phrases.map((p) => `"${p}"`).join(", ")}
${
  profile.expressions.length > 0
    ? `- Characteristic expressions mined from their real speech (templates; "___" is a slot): ${profile.expressions
        .map((e) => `"${e}"`)
        .join(", ")}`
    : ""
}
${corrections ? `- Learned preferences:\n${corrections}` : ""}

PEOPLE THEY KNOW:
${profile.people.map((p) => `- ${p.name} (${p.relationship})${p.notes ? `: ${p.notes}` : ""}`).join("\n")}

OBJECTS THAT MATTER TO THEM:
${profile.objects.map((o) => `- ${o.name}${o.notes ? `: ${o.notes}` : ""}`).join("\n")}

CURRENT SCENE:
${JSON.stringify(ctx)}
${recentPrompt ? `Someone just said to them: "${recentPrompt}"` : ""}

RULES:
- The 3 candidates must represent meaningfully DIFFERENT intents (e.g. a request, an alternative request, a decline/social reply) — never three paraphrases of one intent.
- STRONGLY prefer reusing their characteristic expressions when one fits, filling the "___" slot from the current scene (e.g. expression "I want that damn ___" + a visible blue cup -> "I want that damn blue cup"). Their own words beat generic phrasing.
- If a known person is plausibly in the scene, address them the way ${profile.style.preferredName} would.
- Short. Spoken register. First person. No emojis, no stage directions.
- Output strict JSON: {"candidates": [{"text": "...", "intent": "..."}, {"text": "...", "intent": "..."}, {"text": "...", "intent": "..."}]}`;
}
