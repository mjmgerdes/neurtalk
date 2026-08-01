// Speech output. On macOS, a user-trained Personal Voice (created on-device in
// System Settings > Accessibility > Personal Voice) can appear in the
// speechSynthesis voice list — that is the honest "banked voice" story for the
// demo: voice banking that never leaves the device. Falls back to the best
// available system voice.

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

export function speak(text: string, voiceName?: string): Promise<void> {
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
