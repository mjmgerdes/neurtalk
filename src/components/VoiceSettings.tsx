import { useState } from "react";
import { getAudioBlob, listAudio } from "../state/audioBank";
import {
  activeVoiceEngine,
  cloneVoiceFromSample,
  elevenLabsKey,
  elevenLabsVoiceId,
  setElevenLabsKey,
  speak,
} from "../speech/voice";

/**
 * "My voice" panel: shows which engine will speak, and lets the user connect
 * ElevenLabs to clone their banked onboarding sample. The key is entered by
 * the user and stored only in this browser.
 */
export function VoiceSettings() {
  const [key, setKey] = useState(elevenLabsKey() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [, bump] = useState(0);

  async function clone() {
    setMsg("Cloning from your banked voice sample…");
    try {
      setElevenLabsKey(key);
      const bank = await listAudio();
      // Prefer the dedicated onboarding sample; fall back to any recording.
      const sample =
        bank.find((a) => a.kind === "voice-sample") ?? bank.find((a) => a.kind === "recording");
      if (!sample) throw new Error("No banked voice sample — record one in onboarding first.");
      const blob = await getAudioBlob(sample.id);
      if (!blob) throw new Error("Sample audio missing.");
      await cloneVoiceFromSample(blob, "NeurTalk voice");
      setMsg("✓ Voice clone created — everything now speaks as you.");
      bump((n) => n + 1);
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    }
  }

  return (
    <section>
      <h2>My voice</h2>
      <div className="card">
        <div className="row">
          <div>
            Speaking with: <b>{activeVoiceEngine()}</b>
            {msg && <div className="dim">{msg}</div>}
          </div>
          <button className="link" onClick={() => speak("Hi, this is my voice, and I'd like to keep it.")}>
            test voice
          </button>
        </div>
        {!elevenLabsVoiceId() && (
          <div className="addrow" style={{ marginTop: 10 }}>
            <input
              type="password"
              placeholder="ElevenLabs API key (optional — enables real voice clone)"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              style={{ flex: 1 }}
            />
            <button disabled={!key.trim()} onClick={clone}>
              Clone my banked voice
            </button>
          </div>
        )}
        {elevenLabsVoiceId() && (
          <button
            className="link"
            onClick={() => {
              localStorage.removeItem("neurtalk.el.voiceId");
              setElevenLabsKey("");
              setKey("");
              setMsg("Disconnected — back to on-device voice.");
              bump((n) => n + 1);
            }}
          >
            disconnect ElevenLabs
          </button>
        )}
        <p className="dim" style={{ marginTop: 8 }}>
          Reasoning stays fully on-device either way; voice synthesis is a swappable output
          component. Without a clone, macOS Personal Voice (trained on-device) is used if available.
        </p>
      </div>
    </section>
  );
}
