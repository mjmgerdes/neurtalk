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
import { Icon } from "./Icon";

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
    setMsg("Creating your voice from the saved sample…");
    try {
      setElevenLabsKey(key);
      const bank = await listAudio();
      // Prefer the dedicated onboarding sample; fall back to any recording.
      const sample =
        bank.find((a) => a.kind === "voice-sample") ?? bank.find((a) => a.kind === "recording");
      if (!sample) throw new Error("No voice sample saved. Record one during setup first.");
      const blob = await getAudioBlob(sample.id);
      if (!blob) throw new Error("Sample audio missing.");
      await cloneVoiceFromSample(blob, "NeurTalk voice");
      setMsg("Done. NeurTalk now speaks in your voice.");
      bump((n) => n + 1);
    } catch (e) {
      setMsg(`Couldn’t create the voice: ${(e as Error).message}`);
    }
  }

  return (
    <section className="block" aria-labelledby="voice-h">
      <h2 id="voice-h">Voice</h2>
      <div className="row-item">
        <div>
          <span className="meta">Speaking with</span>
          <strong>{activeVoiceEngine()}</strong>
          {msg && (
            <span className="meta" role="status">
              {msg}
            </span>
          )}
        </div>
        <button onClick={() => speak("Hi, this is my voice, and I'd like to keep it.")}>
          <Icon name="play" size={14} />
          Test
        </button>
      </div>
      {!elevenLabsVoiceId() && (
        <div className="addrow">
          <input
            type="password"
            aria-label="ElevenLabs API key"
            placeholder="ElevenLabs API key (optional)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button disabled={!key.trim()} onClick={clone}>
            Clone my voice
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
            setMsg("Disconnected. Using the on-device voice.");
            bump((n) => n + 1);
          }}
        >
          Disconnect ElevenLabs
        </button>
      )}
      <p className="hint">
        Suggestions are always worked out on this device. A key only changes the voice that reads them
        aloud. Without one, macOS Personal Voice is used if you've set it up.
      </p>
    </section>
  );
}
