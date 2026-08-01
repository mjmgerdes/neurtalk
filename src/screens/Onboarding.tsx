import { useRef, useState } from "react";
import type { Profile } from "../types";
import { DEMO_PROFILE, saveProfile } from "../state/profile";

interface Props {
  onDone: (p: Profile) => void;
}

/**
 * "Preserve Me" — capture the person's voice sample and seed the personal
 * communication bank while they can still communicate easily.
 */
export function Onboarding({ onDone }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sampleUrl, setSampleUrl] = useState<string | undefined>();
  const [steps, setSteps] = useState<string[]>([]);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number>(0);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setSampleUrl(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
      // Staged reveal of what the bank extracts from the sample.
      const reveal = [
        "Voice sample captured",
        "Cadence detected",
        "Tone profile created",
        "Personal phrases extracted",
        "Voice preview ready",
      ];
      reveal.forEach((s, i) => setTimeout(() => setSteps((prev) => [...prev, s]), 400 * (i + 1)));
    };
    mediaRef.current = rec;
    rec.start();
    setRecording(true);
    setSeconds(0);
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    clearInterval(timerRef.current);
  }

  function finish() {
    const profile: Profile = { ...DEMO_PROFILE, voiceSampleUrl: sampleUrl };
    saveProfile(profile);
    onDone(profile);
  }

  return (
    <div className="screen onboarding">
      <h1>Preserve your voice</h1>
      <p className="sub">
        Speak naturally for 15–30 seconds. Talk about anything — the people you love, your morning
        routine, what you'd want to be able to say.
      </p>

      {!recording && !sampleUrl && (
        <button className="big" onClick={startRecording}>
          ● Start recording
        </button>
      )}
      {recording && (
        <button className="big recording" onClick={stopRecording}>
          ■ Stop ({seconds}s)
        </button>
      )}
      {sampleUrl && (
        <div className="captured">
          <audio controls src={sampleUrl} />
          <ul className="reveal">
            {steps.map((s) => (
              <li key={s}>✓ {s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="seed">
        <h2>Your communication bank starts with</h2>
        <p>
          People: <b>Sarah</b> (daughter), <b>Pedro</b> (partner) · Objects: <b>blue mug</b>,{" "}
          <b>red blanket</b> · Style: <b>direct but warm</b>, says “grab” not “bring”
        </p>
        <p className="dim">Everything is editable in the Communication Map. Stored only on this device.</p>
      </div>

      <button className="big primary" disabled={!sampleUrl && steps.length === 0} onClick={finish}>
        Build my communication bank →
      </button>
      <button className="link" onClick={finish}>
        Skip recording (demo profile)
      </button>
    </div>
  );
}
