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
import { SemanticMiner } from "../components/SemanticMiner";
import { BrandMark, Icon, StatusDot } from "../components/Icon";
import type { ExtractedSemantics } from "../llm/gemma";

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

  // Semantics mined from banked audio during onboarding, merged in at finish.
  const [mined, setMined] = useState<ExtractedSemantics>({ expressions: [], quirks: [], people: [] });
  function onMined(s: ExtractedSemantics) {
    setMined((m) => ({
      expressions: [...new Set([...m.expressions, ...s.expressions])],
      quirks: [...new Set([...m.quirks, ...s.quirks])],
      people: [...m.people, ...s.people.filter((p) => !m.people.some((x) => x.name === p.name))],
    }));
  }

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
    const basePeople = people.length > 0 ? people : DEMO_PROFILE.people;
    const profile: Profile = {
      ...DEMO_PROFILE,
      style: {
        ...DEMO_PROFILE.style,
        preferredName: name.trim() || DEMO_PROFILE.style.preferredName,
        quirks: [...new Set([...DEMO_PROFILE.style.quirks, ...mined.quirks])],
      },
      people: [
        ...basePeople,
        ...mined.people
          .filter((p) => !basePeople.some((x) => x.name.toLowerCase() === p.name.toLowerCase()))
          .map((p) => ({ name: p.name, relationship: p.relationship || "—" })),
      ],
      expressions: mined.expressions,
      voiceSampleId: voiceId ?? undefined,
    };
    saveProfile(profile);
    onDone(profile);
  }

  const linkStatus = phoneLinkStatus();

  return (
    <div className="onboarding">
      <span className="brand">
        <BrandMark />
        NeurTalk
      </span>
      <ol className="steps" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`step${i === step ? " is-current" : i < step ? " is-done" : ""}`}
            aria-current={i === step ? "step" : undefined}
          >
            {i < step ? <Icon name="check" size={14} /> : <span className="step-num">{i + 1}</span>}
            {s}
            {i < step && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>

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
            <h2>Record your voice</h2>
            <p>
              Press record and <b>count slowly from 1 to 10</b>, then say:{" "}
              <i>“Hi, this is my voice, and I'd like to keep it.”</i>
            </p>
            {!voiceRec.recording && (
              <button className="big" onClick={voiceRec.start}>
                <span className="rec-dot" aria-hidden="true" />
                {voiceUrl ? "Record again" : "Start recording"}
              </button>
            )}
            {voiceRec.recording && (
              <button className="big recording" onClick={voiceRec.stop}>
                <span className="stop-square" aria-hidden="true" />
                Stop ({voiceRec.seconds}s)
              </button>
            )}
            {voiceUrl && (
              <div className="captured">
                <audio controls src={voiceUrl} />
                <p className="hint">Saved. NeurTalk will speak from this sample.</p>
              </div>
            )}
          </div>
          <div className="wizardnav">
            <button className="big primary" disabled={!voiceUrl && !name.trim()} onClick={() => setStep(1)}>
              Continue
            </button>
            <button className="link" onClick={() => setStep(1)}>
              Skip for now
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
              Upload audio or video
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
                <span className="rec-dot" aria-hidden="true" />
                Record me talking
              </button>
            ) : (
              <button className="big recording" onClick={ctxRec.stop}>
                <span className="stop-square" aria-hidden="true" />
                Stop ({ctxRec.seconds}s)
              </button>
            )}
          </div>
          <section className="block">
            <h2>Audio bank ({bank.length})</h2>
            {bank.length === 0 && <p className="hint">Nothing added yet.</p>}
            <ul className="rows">
            {bank.map((a) => (
              <li className="row-item is-stacked" key={a.id}>
                <div className="row-line">
                  <div>
                    <strong>{a.label}</strong>
                    <span className="meta">
                      {a.kind === "voice-sample" ? "Voice sample" : a.kind === "upload" ? "Upload" : "Recording"} ·{" "}
                      {fmtDur(a.duration)}
                    </span>
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
                    Remove
                  </button>
                </div>
                <SemanticMiner item={a} onMined={onMined} />
              </li>
            ))}
            </ul>
            {(mined.expressions.length > 0 || mined.quirks.length > 0) && (
              <div className="found">
                <h3>Found so far</h3>
                <ul className="tags">
                  {mined.expressions.map((x) => (
                    <li className="tag is-accent" key={x}>
                      {x}
                    </li>
                  ))}
                  {mined.quirks.map((x) => (
                    <li className="tag" key={x}>
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <div className="wizardnav">
            <button className="big primary" onClick={() => setStep(2)}>
              Continue
            </button>
            <button className="link" onClick={() => setStep(0)}>
              Back
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Who matters to you?</h1>
          <p className="sub">
            The people NeurTalk should recognize, and speak to the way you would.
          </p>
          {people.length > 0 && (
            <ul className="rows">
              {people.map((p) => (
                <li className="row-item" key={p.name}>
                  <div>
                    <strong>{p.name}</strong>
                    <span className="meta">{p.relationship}</span>
                  </div>
                  <button className="link" onClick={() => setPeople(people.filter((x) => x !== p))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="addrow">
            <input aria-label="Name" placeholder="Name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
            <input
              aria-label="Relationship"
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
            <p className="hint">If you skip this, NeurTalk starts with two example people: Sarah (daughter) and Pedro (partner).</p>
          )}
          <div className="wizardnav">
            <button className="big primary" onClick={() => setStep(3)}>
              Continue
            </button>
            <button className="link" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Connect your visual input</h1>
          <p className="sub">
            NeurTalk understands your surroundings through a wearable camera. Your phone can be that
            camera: scan the code and it shares what it sees with this screen.
          </p>
          <div className="visualpanel">
            <div className={`viewfinder${linkStatus === "connected" ? " live" : ""}`}>
              {linkStatus === "connected" ? (
                <>
                  <video ref={previewRef} muted playsInline />
                  <span className="livetag">
                    <span className="rec-dot" aria-hidden="true" />
                    Live
                  </span>
                </>
              ) : qr ? (
                <img src={qr} alt="QR code to connect your phone" className="vf-qr" />
              ) : (
                <span className="hint">Preparing link…</span>
              )}
            </div>
            <div className="visualinfo">
              <p className="status-line" role="status">
                <StatusDot ok={linkStatus === "connected" ? true : linkStatus === "error" ? false : null} />
                {linkStatus === "connected"
                  ? "Phone connected"
                  : linkStatus === "error"
                    ? "Couldn’t connect"
                    : "Waiting for your phone"}
              </p>
              {linkStatus === "connected" ? (
                <>
                  <h3>This is what NeurTalk sees.</h3>
                  <p className="hint">
                    Point your phone at the people and objects around you. NeurTalk reads this view to
                    suggest what you might want to say.
                  </p>
                </>
              ) : linkStatus === "error" ? (
                <p className="hint">You can connect your phone later from Talk.</p>
              ) : (
                <>
                  <ol className="linksteps">
                    <li><span>Scan the code with your phone camera</span></li>
                    <li>
                      <span>
                        Tap <b>Start streaming</b> on your phone
                      </span>
                    </li>
                    <li><span>Your live view appears here</span></li>
                  </ol>
                  <code className="joinurl">{phoneJoinUrl()}</code>
                </>
              )}
            </div>
          </div>
          <div className="wizardnav">
            <button className="big primary" onClick={finish}>
              {linkStatus === "connected" ? "Finish setup" : "Finish without a phone"}
            </button>
            <button className="link" onClick={() => setStep(2)}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
