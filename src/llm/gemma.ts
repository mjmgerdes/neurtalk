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
      // keep_alive keeps the model resident between calls; num_predict caps
      // generation so a wandering model can't stall the live demo.
      keep_alive: "60m",
      options: { temperature: 0.7, num_predict: 300 },
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
