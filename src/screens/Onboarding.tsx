import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Person, Profile } from "../types";
import { DEMO_PROFILE, saveProfile } from "../state/profile";
import {
  addAudio,
  deleteAudio,
  listAudio,
  newId,
  probeDuration,
  type AudioItem,
} from "../state/audioBank";
import { phoneJoinUrl, phoneLinkStatus, phoneStream, startHost, subscribePhoneLink } from "../peer/phoneLink";

interface Props {
  onDone: (p: Profile) => void;
}

const STEPS = ["Your voice", "Audio context", "Your people", "Visual input"] as const;

function useRecorder(onDone: (blob: Blob, mime: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef(0);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      onDone(new Blob(chunks, { type: rec.mimeType }), rec.mimeType);
    };
    recRef.current = rec;
    rec.start();
    setRecording(true);
    setSeconds(0);
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stop() {
    recRef.current?.stop();
    setRecording(false);
    clearInterval(timerRef.current);
  }

  return { recording, seconds, start, stop };
}

function fmtDur(s: number) {
  return s >= 1 ? `${Math.round(s)}s` : "—";
}

export function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");

  // Step 1: voice sample
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const voiceRec = useRecorder(async (blob, mime) => {
    const id = newId();
    const duration = await probeDuration(blob);
    await addAudio(blob, { id, label: "My voice sample", kind: "voice-sample", mime, duration, addedAt: Date.now() });
    setVoiceId(id);
    setVoiceUrl(URL.createObjectURL(blob));
    refreshBank();
  });

  // Step 2: audio bank
  const [bank, setBank] = useState<AudioItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const ctxRec = useRecorder(async (blob, mime) => {
    const duration = await probeDuration(blob);
    await addAudio(blob, {
      id: newId(),
      label: `Recording ${new Date().toLocaleTimeString()}`,
      kind: "recording",
      mime,
      duration,
      addedAt: Date.now(),
    });
    refreshBank();
  });

  async function refreshBank() {
    setBank(await listAudio());
  }
  useEffect(() => {
    refreshBank();
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const duration = await probeDuration(f);
      const isVideo = f.type.startsWith("video");
      await addAudio(f, {
        id: newId(),
        label: isVideo ? `${f.name} (audio extracted)` : f.name,
        kind: "upload",
        mime: f.type,
        duration,
        addedAt: Date.now(),
      });
    }
    refreshBank();
    if (fileRef.current) fileRef.current.value = "";
  }

  // Step 3: people
  const [people, setPeople] = useState<Person[]>([]);
  const [np, setNp] = useState({ name: "", relationship: "" });

  // Step 4: phone link
  const [qr, setQr] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (step !== 3) return;
    startHost();
    QRCode.toDataURL(phoneJoinUrl(), { width: 240, margin: 1 }).then(setQr);
    return subscribePhoneLink(() => forceRender((n) => n + 1));
  }, [step]);
  useEffect(() => {
    const s = phoneStream();
    if (previewRef.current && s) {
      previewRef.current.srcObject = s;
      previewRef.current.play();
    }
  });

  function finish() {
    const profile: Profile = {
      ...DEMO_PROFILE,
      style: { ...DEMO_PROFILE.style, preferredName: name.trim() || DEMO_PROFILE.style.preferredName },
      people: people.length > 0 ? people : DEMO_PROFILE.people,
      voiceSampleId: voiceId ?? undefined,
    };
    saveProfile(profile);
    onDone(profile);
  }

  const linkStatus = phoneLinkStatus();

  return (
    <div className="screen onboarding wizard">
      <div className="steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`step ${i === step ? "current" : i < step ? "done" : ""}`}>
            {i < step ? "✓ " : `${i + 1}. `}
            {s}
          </span>
        ))}
      </div>

      {step === 0 && (
        <>
          <h1>Create your profile</h1>
          <p className="sub">
            NeurTalk banks your voice now so it can speak as you later, when speaking becomes hard.
            Everything stays on this device.
          </p>
          <label className="field">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya" />
          </label>
          <div className="seed">
            <h2>Capture your voice</h2>
            <p>
              Press record and <b>count slowly from 1 to 10</b>, then say:{" "}
              <i>“Hi, this is my voice, and I'd like to keep it.”</i>
            </p>
            {!voiceRec.recording && (
              <button className="big" onClick={voiceRec.start}>
                ● {voiceUrl ? "Re-record" : "Record my voice"}
              </button>
            )}
            {voiceRec.recording && (
              <button className="big recording" onClick={voiceRec.stop}>
                ■ Stop ({voiceRec.seconds}s)
              </button>
            )}
            {voiceUrl && (
              <div className="captured">
                <audio controls src={voiceUrl} />
                <p className="dim">✓ Voice sample banked — this is what NeurTalk will speak from.</p>
              </div>
            )}
          </div>
          <div className="wizardnav">
            <button className="big primary" disabled={!voiceUrl && !name.trim()} onClick={() => setStep(1)}>
              Continue →
            </button>
            <button className="link" onClick={() => setStep(1)}>
              skip for now
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1>Add audio context</h1>
          <p className="sub">
            The more of your real speech NeurTalk has, the more its suggestions sound like you.
            Upload voicemails, videos, voice memos — or just record yourself talking.
          </p>
          <div className="contextrow">
            <button className="big" onClick={() => fileRef.current?.click()}>
              ⬆ Upload audio / video
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              multiple
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />
            {!ctxRec.recording ? (
              <button className="big" onClick={ctxRec.start}>
                ● Record me talking
              </button>
            ) : (
              <button className="big recording" onClick={ctxRec.stop}>
                ■ Stop ({ctxRec.seconds}s)
              </button>
            )}
          </div>
          <section>
            <h2>Audio bank ({bank.length})</h2>
            {bank.length === 0 && <p className="dim">Nothing banked yet.</p>}
            {bank.map((a) => (
              <div className="card row" key={a.id}>
                <div>
                  {a.kind === "voice-sample" ? "🎙" : a.kind === "upload" ? "📁" : "🔴"} <b>{a.label}</b>
                  <div className="dim">
                    {a.kind} · {fmtDur(a.duration)} · {new Date(a.addedAt).toLocaleTimeString()}
                  </div>
                </div>
                <button
                  className="link"
                  onClick={async () => {
                    await deleteAudio(a.id);
                    if (a.id === voiceId) {
                      setVoiceId(null);
                      setVoiceUrl(null);
                    }
                    refreshBank();
                  }}
                >
                  remove
                </button>
              </div>
            ))}
          </section>
          <div className="wizardnav">
            <button className="big primary" onClick={() => setStep(2)}>
              Continue →
            </button>
            <button className="link" onClick={() => setStep(0)}>
              ← back
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Who matters to you?</h1>
          <p className="sub">
            Names, relationships — the people NeurTalk should recognize and speak to the way you would.
          </p>
          {people.map((p) => (
            <div className="card row" key={p.name}>
              <div>
                <b>{p.name}</b> — {p.relationship}
              </div>
              <button className="link" onClick={() => setPeople(people.filter((x) => x !== p))}>
                remove
              </button>
            </div>
          ))}
          <div className="addrow">
            <input placeholder="Name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
            <input
              placeholder="Relationship (daughter, partner, nurse…)"
              value={np.relationship}
              onChange={(e) => setNp({ ...np, relationship: e.target.value })}
            />
            <button
              disabled={!np.name.trim()}
              onClick={() => {
                setPeople([...people, { name: np.name.trim(), relationship: np.relationship.trim() || "—" }]);
                setNp({ name: "", relationship: "" });
              }}
            >
              Add
            </button>
          </div>
          {people.length === 0 && (
            <p className="dim">Skip to start with the demo people (Sarah — daughter, Pedro — partner).</p>
          )}
          <div className="wizardnav">
            <button className="big primary" onClick={() => setStep(3)}>
              Continue →
            </button>
            <button className="link" onClick={() => setStep(1)}>
              ← back
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Connect your visual input</h1>
          <p className="sub">
            NeurTalk reads your surroundings through a wearable camera — smart glasses in the real
            product. For now, your phone stands in: scan the code and its camera becomes your view.
          </p>
          <div className="linkrow">
            {qr && linkStatus !== "connected" && (
              <div className="qrbox">
                <img src={qr} alt="QR to connect phone" />
                <p className="dim">Scan with your phone camera</p>
                <p className="joinurl">{phoneJoinUrl()}</p>
              </div>
            )}
            <div className="linkstatus">
              {linkStatus === "waiting" && <p>⏳ Waiting for your phone to connect…</p>}
              {linkStatus === "connected" && (
                <>
                  <p>✅ Phone connected — live view:</p>
                  <video ref={previewRef} muted playsInline className="phonepreview" />
                </>
              )}
              {linkStatus === "error" && <p>⚠️ Link error — you can connect later from the Talk screen.</p>}
            </div>
          </div>
          <div className="wizardnav">
            <button className="big primary" onClick={finish}>
              {linkStatus === "connected" ? "Finish — open NeurTalk →" : "Finish without phone →"}
            </button>
            <button className="link" onClick={() => setStep(2)}>
              ← back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
