import { useEffect, useRef, useState } from "react";
import type { AccessMethod, Candidate, Profile, SceneContext, SelectionSlot } from "../types";
import { HeadTracker, type HeadPose } from "../input/headTracker";
import { useSelection, TUNING } from "../input/useSelection";
import {
  describeScene,
  generateCandidates,
  ollamaAvailable,
  FALLBACK_CANDIDATES,
  FALLBACK_SCENE,
  MODEL,
} from "../llm/gemma";
import { speak } from "../speech/voice";
import { addCorrection } from "../state/profile";

interface Props {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
}

// Fixed, user-approved urgent messages that bypass generative inference entirely.
const URGENT = ["I need help right now.", "I'm in pain.", "Please reposition me."];

function diffLearned(rejected: string, chosen: string): string {
  const a = rejected.toLowerCase().split(/\s+/);
  const b = chosen.toLowerCase().split(/\s+/);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `"${b[i].replace(/[^\w']/g, "")}" over "${a[i].replace(/[^\w']/g, "")}"`;
  }
  return "shorter phrasing";
}

export function Talk({ profile, onProfileChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<HeadTracker | null>(null);
  const [method, setMethod] = useState<AccessMethod>("head");
  const [gemmaOnline, setGemmaOnline] = useState<boolean | null>(null);
  const [pose, setPose] = useState<HeadPose>({ yaw: 0, pitch: 0, faceDetected: false });
  const [context, setContext] = useState<SceneContext | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<string[]>([]);
  const [editing, setEditing] = useState<SelectionSlot | null>(null);
  const [editText, setEditText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [recentPrompt, setRecentPrompt] = useState("Do you need anything?");

  const sel = useSelection(method, candidates !== null && editing === null, async (slot, stage) => {
    if (!candidates) return;
    if (stage === "confirming") {
      const text = candidates[slot].text;
      await speak(text, profile.voiceName);
      setSpoken((s) => [text, ...s]);
      setCandidates(null);
      setContext(null);
    }
  });

  useEffect(() => {
    ollamaAvailable().then(setGemmaOnline);
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 960 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const t = new HeadTracker();
      await t.init();
      t.onPose = (p) => {
        setPose(p);
        sel.feedPose(p);
      };
      if (videoRef.current) t.start(videoRef.current);
      trackerRef.current = t;
    })().catch((e) => console.error("camera/tracker init failed", e));
    return () => trackerRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function captureFrame(): string | null {
    const v = videoRef.current;
    if (!v) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }

  async function readScene() {
    setBusy("Reading the scene…");
    setCandidates(null);
    try {
      const online = await ollamaAvailable();
      setGemmaOnline(online);
      let ctx: SceneContext;
      let cands: Candidate[];
      if (online) {
        const frame = captureFrame();
        ctx = frame ? await describeScene(frame) : FALLBACK_SCENE;
        setContext(ctx);
        setBusy("Generating what you might want to say…");
        cands = await generateCandidates(profile, ctx, recentPrompt || undefined);
        setUsedFallback(false);
      } else {
        ctx = FALLBACK_SCENE;
        setContext(ctx);
        cands = FALLBACK_CANDIDATES;
        setUsedFallback(true);
      }
      setCandidates(cands);
      sel.setStage("choosing");
    } catch (e) {
      console.error(e);
      setContext(FALLBACK_SCENE);
      setCandidates(FALLBACK_CANDIDATES);
      setUsedFallback(true);
    } finally {
      setBusy(null);
    }
  }

  function startEdit(slot: SelectionSlot) {
    if (!candidates) return;
    setEditing(slot);
    setEditText(candidates[slot].text);
  }

  function saveEdit() {
    if (editing === null || !candidates) return;
    const rejected = candidates[editing].text;
    if (editText.trim() && editText.trim() !== rejected) {
      const learned = diffLearned(rejected, editText.trim());
      const next = addCorrection(profile, {
        rejected,
        chosen: editText.trim(),
        learned,
        at: Date.now(),
      });
      onProfileChange(next);
      setToast(`Preference learned: ${learned}`);
      setTimeout(() => setToast(null), 3500);
      const updated = [...candidates];
      updated[editing] = { ...updated[editing], text: editText.trim() };
      setCandidates(updated);
    }
    setEditing(null);
  }

  return (
    <div className="screen talk">
      <div className="statusbar">
        <span className={`badge ${gemmaOnline ? "on" : "off"}`}>
          {gemmaOnline ? `Gemma local · ${MODEL}` : "Gemma offline · demo candidates"}
        </span>
        <span className={`badge ${pose.faceDetected ? "on" : "off"}`}>
          {pose.faceDetected ? "face tracked" : "no face"}
        </span>
        <select value={method} onChange={(e) => setMethod(e.target.value as AccessMethod)}>
          <option value="head">Access: head control</option>
          <option value="keys">Access: keys (1/2/3 + Enter)</option>
          <option value="switch">Access: single switch (scan + Space)</option>
        </select>
        <button onClick={() => trackerRef.current?.calibrate()}>Calibrate neutral</button>
      </div>

      <div className="videowrap">
        <video ref={videoRef} muted playsInline className="mirror" />
        <div className="posedebug">
          yaw {pose.yaw.toFixed(3)} · pitch {pose.pitch.toFixed(3)} · thresholds ±{TUNING.yawThreshold}/
          {TUNING.nodThreshold}
        </div>
      </div>

      <div className="contextrow">
        <input
          value={recentPrompt}
          onChange={(e) => setRecentPrompt(e.target.value)}
          placeholder='What was just said to you? e.g. "Do you need anything?"'
        />
        <button className="primary" onClick={readScene} disabled={!!busy}>
          {busy ?? "Read scene → suggest messages"}
        </button>
      </div>

      {context && (
        <div className="chips">
          {context.people_present.map((p) => (
            <span className="chip person" key={p}>
              👤 {p}
            </span>
          ))}
          {context.objects_visible.map((o) => (
            <span className="chip" key={o}>
              {o}
            </span>
          ))}
          <span className="chip">{context.location}</span>
          {usedFallback && <span className="chip warn">demo context (Gemma offline)</span>}
        </div>
      )}

      {candidates && sel.stage === "choosing" && (
        <div className="cards">
          {candidates.map((c, i) => (
            <div key={i} className={`candidate ${sel.highlighted === i ? "highlighted" : ""}`}>
              <div className="intent">{c.intent}</div>
              <div className="text">{c.text}</div>
              <button className="link" onClick={() => startEdit(i as SelectionSlot)}>
                edit
              </button>
            </div>
          ))}
        </div>
      )}

      {candidates && sel.stage === "confirming" && (
        <div className="confirm">
          <div className="confirmtext">“{candidates[sel.highlighted].text}”</div>
          <div className="confirmhint">
            Speak this? {method === "head" ? "Nod again to speak" : method === "keys" ? "Enter to speak" : "Press switch to speak"} ·{" "}
            <button className="link" onClick={sel.cancel}>
              cancel
            </button>
          </div>
        </div>
      )}

      {editing !== null && (
        <div className="editbox">
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} />
          <button className="primary" onClick={saveEdit}>
            Save — teach my bank
          </button>
          <button className="link" onClick={() => setEditing(null)}>
            cancel
          </button>
        </div>
      )}

      {toast && <div className="toast">✦ {toast}</div>}

      <div className="urgent">
        {URGENT.map((u) => (
          <button key={u} className="urgentbtn" onClick={() => speak(u, profile.voiceName)}>
            {u}
          </button>
        ))}
        <span className="dim">fixed messages — never AI-generated</span>
      </div>

      {spoken.length > 0 && (
        <div className="history">
          <h2>Spoken</h2>
          {spoken.map((s, i) => (
            <div className="dim" key={i}>
              🔊 {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
