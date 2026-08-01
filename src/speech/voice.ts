// Speech output — the "banked voice" chain, best available first:
//   1. ElevenLabs instant voice clone made from the user's banked onboarding
//      sample (optional, cloud; user supplies their own API key — disclosed
//      honestly in the writeup as the one non-local component)
//   2. macOS Personal Voice (trained fully on-device by the user)
//   3. Best local system voice
// The reasoning stack (Gemma) stays fully local either way.

const EL_KEY = "neurtalk.el.key";
const EL_VOICE = "neurtalk.el.voiceId";

export function elevenLabsKey(): string | null {
  return localStorage.getItem(EL_KEY);
}
export function setElevenLabsKey(k: string) {
  if (k.trim()) localStorage.setItem(EL_KEY, k.trim());
  else localStorage.removeItem(EL_KEY);
}
export function elevenLabsVoiceId(): string | null {
  return localStorage.getItem(EL_VOICE);
}

/** Create an ElevenLabs instant voice clone from the banked sample. Returns the voice id. */
export async function cloneVoiceFromSample(sample: Blob, name: string): Promise<string> {
  const key = elevenLabsKey();
  if (!key) throw new Error("No ElevenLabs API key set");
  const form = new FormData();
  form.append("name", name);
  form.append("files", sample, "neurtalk-sample.webm");
  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  localStorage.setItem(EL_VOICE, data.voice_id);
  return data.voice_id;
}

async function speakElevenLabs(text: string): Promise<boolean> {
  const key = elevenLabsKey();
  const voiceId = elevenLabsVoiceId();
  if (!key || !voiceId) return false;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
    });
    if (!res.ok) return false;
    const url = URL.createObjectURL(await res.blob());
    await new Promise<void>((resolve) => {
      const a = new Audio(url);
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function listVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices();
}

export function pickVoice(preferredName?: string): SpeechSynthesisVoice | undefined {
  const voices = listVoices();
  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName);
    if (exact) return exact;
  }
  return (
    voices.find((v) => v.name.toLowerCase().includes("personal")) ??
    voices.find((v) => v.lang.startsWith("en") && v.localService) ??
    voices[0]
  );
}

/** Which engine will actually speak right now — shown in the UI. */
export function activeVoiceEngine(): string {
  if (elevenLabsKey() && elevenLabsVoiceId()) return "Your cloned voice (ElevenLabs)";
  const v = pickVoice();
  if (v?.name.toLowerCase().includes("personal")) return `Personal Voice — ${v.name}`;
  return `System voice — ${v?.name ?? "default"}`;
}

export async function speak(text: string, voiceName?: string): Promise<void> {
  if (await speakElevenLabs(text)) return;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voiceName);
    if (v) u.voice = v;
    u.rate = 1.0;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
