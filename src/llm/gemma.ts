import type { Candidate, Profile, SceneContext } from "../types";
import { candidatesPrompt, scenePrompt } from "./prompts";

// All inference is local: Ollama serves Gemma on localhost. No cloud calls.
const OLLAMA_URL = "http://localhost:11434";
// Overridable at the event depending on which Gemma build is available locally.
export const MODEL = localStorage.getItem("neurtalk.model") ?? "gemma4";

async function chat(messages: object[], expectJson = true): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      ...(expectJson ? { format: "json" } : {}),
      // keep_alive keeps the model resident between calls. num_predict must
      // leave room for gemma4's thinking tokens as well as the JSON answer —
      // a tight cap returns empty content.
      keep_alive: "60m",
      options: { temperature: 0.7, num_predict: 1200 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? "";
}

export async function ollamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Vision pass: camera frame (base64 JPEG, no data: prefix) -> structured scene context. */
export async function describeScene(imageBase64: string): Promise<SceneContext> {
  const content = await chat([{ role: "user", content: scenePrompt(), images: [imageBase64] }]);
  const parsed = JSON.parse(content);
  return {
    people_present: parsed.people_present ?? [],
    objects_visible: parsed.objects_visible ?? [],
    location: parsed.location ?? "unknown",
    activity: parsed.activity ?? "",
  };
}

/** Language pass: profile + scene -> exactly 3 intent-distinct candidates. */
export async function generateCandidates(
  profile: Profile,
  ctx: SceneContext,
  recentPrompt?: string
): Promise<Candidate[]> {
  const content = await chat([{ role: "user", content: candidatesPrompt(profile, ctx, recentPrompt) }]);
  const parsed = JSON.parse(content);
  const cands: Candidate[] = (parsed.candidates ?? []).slice(0, 3);
  if (cands.length < 3) throw new Error("model returned fewer than 3 candidates");
  return cands;
}

export interface ExtractedSemantics {
  expressions: string[];
  quirks: string[];
  people: { name: string; relationship: string }[];
}

/**
 * Semantic parsing pass: a transcript of the person's real speech -> the
 * building blocks of their semantic map. Expressions are generalized into
 * reusable templates ("I want that damn ___") so the candidate generator can
 * re-fill them from the current scene.
 */
export async function extractSemantics(transcript: string): Promise<ExtractedSemantics> {
  const content = await chat([
    {
      role: "user",
      content: `You are building the semantic communication map of a person from a transcript of their natural speech. Extract:
1. "expressions": characteristic phrases they actually use, generalized into reusable templates by replacing specific objects/names with "___" where sensible (e.g. "I want that damn ___", "Hey ___, come here a sec"). Only phrases that feel distinctive of THIS speaker, max 6.
2. "quirks": short style habits (e.g. "swears casually", "starts requests with Hey", "short direct sentences"), max 5.
3. "people": people they mention, with relationship if stated or clearly implied.

TRANSCRIPT:
"""${transcript}"""

Output strict JSON: {"expressions": ["..."], "quirks": ["..."], "people": [{"name": "...", "relationship": "..."}]}`,
    },
  ]);
  const parsed = JSON.parse(content);
  return {
    expressions: parsed.expressions ?? [],
    quirks: parsed.quirks ?? [],
    people: parsed.people ?? [],
  };
}

/**
 * Preference-learning pass: when the user edits a proposed message, Gemma
 * names the preference (so it's human-auditable in the map) and, when the
 * edit reveals a reusable pattern, mines it as an expression template.
 */
export async function analyzeCorrection(
  rejected: string,
  chosen: string
): Promise<{ learned: string; expression: string | null }> {
  const content = await chat([
    {
      role: "user",
      content: `A user of an assistive communication device edited a message the system proposed for them. This edit is a signal about how THEY prefer to phrase things.

Proposed: "${rejected}"
Their edit: "${chosen}"

1. "learned": name the preference in under 8 words, quoting the key words (e.g. '"grab" over "bring"', 'drops polite framing', 'shorter and blunter').
2. "expression": if the edit reveals a reusable personal phrasing pattern, give it as a template with "___" for the changeable slot (e.g. "I want that damn ___"); otherwise null.

Output strict JSON: {"learned": "...", "expression": "..." or null}`,
    },
  ]);
  const parsed = JSON.parse(content);
  return { learned: parsed.learned ?? "phrasing preference", expression: parsed.expression ?? null };
}

// Offline fallback so the interaction demo still runs if local inference is down.
// Clearly labeled in the UI as "demo candidates" when used.
export const FALLBACK_SCENE: SceneContext = {
  people_present: ["Sarah"],
  objects_visible: ["blue mug", "coffee pot"],
  location: "kitchen",
  activity: "Sarah is standing near the counter",
};

export const FALLBACK_CANDIDATES: Candidate[] = [
  { text: "Hey Sarah, can you grab my blue mug?", intent: "request" },
  { text: "Could you put the blue mug beside me?", intent: "alternative request" },
  { text: "I'm good for now, thanks.", intent: "decline" },
];
