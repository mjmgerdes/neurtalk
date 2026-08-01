import { useEffect, useRef, useState } from "react";
import type { AccessMethod, Candidate, Profile, SceneContext, SelectionSlot } from "../types";
import { HeadTracker, type HeadPose } from "../input/headTracker";
import { useSelection, TUNING } from "../input/useSelection";
import {
  analyzeCorrection,
  describeScene,
  generateCandidates,
  ollamaAvailable,
  FALLBACK_CANDIDATES,
  FALLBACK_SCENE,
  MODEL,
} from "../llm/gemma";
import { speak } from "../speech/voice";
import { addCorrection, saveProfile } from "../state/profile";
import { recordSpoken } from "../state/history";
import { recordContext } from "../state/contextLog";
import QRCode from "qrcode";
import {
  onPhoneMessage,
  phoneJoinUrl,
  phoneLinkStatus,
  phoneStream,
  sendToPhone,
  startHost,
  subscribePhoneLink,
} from "../peer/phoneLink";

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
  const shownAtRef = useRef(0);
  const editedSlotsRef = useRef(new Set<number>());
  const sceneVideoRef = useRef<HTMLVideoElement>(null);
  const [, linkTick] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const sel = useSelection(method, candidates !== null && editing === null, async (slot, stage) => {
    if (!candidates) return;
    if (stage === "confirming") {
      const text = candidates[slot].text;
      sendToPhone({ type: "spoken", text });
      await speak(text, profile.voiceName);
      setSpoken((s) => [text, ...s]);
      recordSpoken({
        text,
        method,
        msToMessage: Date.now() - shownAtRef.current,
        edited: editedSlotsRef.current.has(slot),
        urgent: false,
        at: Date.now(),
      });
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

  // Phone-as-glasses link: when a phone is streaming, its camera is the scene
  // and its tilt/nod drives the same selection core as head tracking.
  useEffect(() => subscribePhoneLink(() => linkTick((n) => n + 1)), []);
  useEffect(
    () =>
      onPhoneMessage((m) => {
        if (m.type === "highlight") sel.highlightExternal(m.slot as SelectionSlot);
        if (m.type === "confirm") sel.confirmExternal();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Mirror HUD state to the phone.
  useEffect(() => {
    if (candidates) sendToPhone({ type: "candidates", candidates, highlighted: sel.highlighted });
    else sendToPhone({ type: "clear" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);
  useEffect(() => {
    sendToPhone({ type: "highlight", slot: sel.highlighted });
  }, [sel.highlighted]);
  useEffect(() => {
    sendToPhone({ type: "stage", stage: sel.stage, slot: sel.highlighted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.stage]);
  useEffect(() => {
    const s = phoneStream();
    if (sceneVideoRef.current && s && sceneVideoRef.current.srcObject !== s) {
      sceneVideoRef.current.srcObject = s;
      sceneVideoRef.current.play();
    }
  });

  async function connectPhone() {
    startHost();
    setQr(await QRCode.toDataURL(phoneJoinUrl(), { width: 220, margin: 1 }));
    setShowQr(true);
  }

  function captureFrame(): string | null {
    // Prefer the phone (glasses stand-in) view; fall back to the laptop camera.
    const phoneLive = phoneLinkStatus() === "connected" && sceneVideoRef.current?.videoWidth;
    const v = phoneLive ? sceneVideoRef.current! : videoRef.current;
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
        recordContext({
          ctx,
          source: phoneLinkStatus() === "connected" ? "phone" : "laptop",
          at: Date.now(),
        });
        setBusy("Generating what you might want to say…");
        cands = await generateCandidates(profile, ctx, recentPrompt || undefined);
        setUsedFallback(false);
      } else {
        ctx = FALLBACK_SCENE;
        setContext(ctx);
        recordContext({ ctx, source: "demo", at: Date.now() });
        cands = FALLBACK_CANDIDATES;
        setUsedFallback(true);
      }
      setCandidates(cands);
      shownAtRef.current = Date.now();
      editedSlotsRef.current.clear();
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

  async function saveEdit() {
    if (editing === null || !candidates) return;
    const rejected = candidates[editing].text;
    const chosen = editText.trim();
    const slot = editing;
    setEditing(null);
    if (!chosen || chosen === rejected) return;

    const updated = [...candidates];
    updated[slot] = { ...updated[slot], text: chosen };
    setCandidates(updated);
    editedSlotsRef.current.add(slot);

    // Gemma names the preference (and mines any reusable template); the
    // word-diff heuristic is only the offline fallback.
    let learned = diffLearned(rejected, chosen);
    let expression: string | null = null;
    try {
      if (await ollamaAvailable()) ({ learned, expression } = await analyzeCorrection(rejected, chosen));
    } catch (e) {
      console.error("correction analysis fell back to heuristic", e);
    }
    let next = addCorrection(profile, { rejected, chosen, learned, at: Date.now() });
    if (expression && !next.expressions.includes(expression)) {
      next = { ...next, expressions: [...next.expressions, expression] };
      saveProfile(next);
    }
    onProfileChange(next);
    setToast(`Preference learned: ${learned}${expression ? ` · new expression: "${expression}"` : ""}`);
    setTimeout(() => setToast(null), 4500);
  }

  return (
    <div className="screen talk">
      <header className="screen-heading">
        <div>
          <p className="eyebrow">Communication workspace</p>
          <h1>Say what you mean.</h1>
          <p className="sub">NeurTalk reads the moment, then offers three distinctly yours ways to respond.</p>
        </div>
        <div className="interaction-hint" aria-label="Selection instructions">
          <span>turn to choose</span>
          <i aria-hidden="true">→</i>
          <span>nod to speak</span>
        </div>
      </header>

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
        <span className={`badge ${phoneLinkStatus() === "connected" ? "on" : "off"}`}>
          {phoneLinkStatus() === "connected" ? "phone camera live" : "no phone camera"}
        </span>
        {phoneLinkStatus() !== "connected" && (
          <button onClick={connectPhone}>Connect phone (glasses)</button>
        )}
      </div>

      {showQr && phoneLinkStatus() !== "connected" && qr && (
        <div className="qrbox inline">
          <img src={qr} alt="QR to connect phone" />
          <div>
            <p>Scan with your phone — its camera becomes your visual input.</p>
            <p className="joinurl">{phoneJoinUrl()}</p>
            <button className="link" onClick={() => setShowQr(false)}>
              hide
            </button>
          </div>
        </div>
      )}

      <section className="capture-panel" aria-label="Scene input">
        <div className="panel-label"><span>01</span> Live visual context</div>
        <div className="videorow">
          <div className="videowrap">
            <video ref={videoRef} muted playsInline className="mirror" />
            <div className="posedebug">
              yaw {pose.yaw.toFixed(3)} · pitch {pose.pitch.toFixed(3)} · thresholds ±{TUNING.yawThreshold}/
              {TUNING.nodThreshold}
            </div>
            <div className="videolabel">you · head control</div>
          </div>
          <div className={`videowrap ${phoneLinkStatus() === "connected" ? "" : "hiddenvid"}`}>
            <video ref={sceneVideoRef} muted playsInline />
            <div className="videolabel">your view · phone camera</div>
          </div>
        </div>

        <div className="prompt-label">What did you just hear?</div>
        <div className="contextrow prompt-row">
          <input
            aria-label="What was just said to you?"
            value={recentPrompt}
            onChange={(e) => setRecentPrompt(e.target.value)}
            placeholder='e.g. “Do you need anything?”'
          />
          <button className="primary" onClick={readScene} disabled={!!busy}>
            {busy ?? "Read the moment"}
            {!busy && <span aria-hidden="true">↗</span>}
          </button>
        </div>

        {context && (
          <div className="chips context-chips">
            {context.people_present.map((p) => (
              <span className="chip person" key={p}>
                <i aria-hidden="true" /> {p}
              </span>
            ))}
            {context.objects_visible.map((o) => (
              <span className="chip" key={o}>
                {o}
              </span>
            ))}
            <span className="chip">{context.location}</span>
            {usedFallback && <span className="chip warn">demo context · Gemma offline</span>}
          </div>
        )}
      </section>

      {candidates && sel.stage === "choosing" && (
        <section className="response-panel" aria-label="Suggested responses">
          <div className="panel-label"><span>02</span> Choose your response</div>
          <div className="cards">
            {candidates.map((c, i) => (
              <div key={i} className={`candidate ${sel.highlighted === i ? "highlighted" : ""}`}>
                <div className="candidate-topline">
                  <div className="intent">{c.intent}</div>
                  <span className="direction">{i === 0 ? "Left" : i === 1 ? "Center" : "Right"}</span>
                </div>
                <div className="text">{c.text}</div>
                <button className="link edit-link" onClick={() => startEdit(i as SelectionSlot)}>
                  Edit response
                </button>
              </div>
            ))}
          </div>
        </section>
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
        <span className="urgent-label">Urgent phrases</span>
        {URGENT.map((u) => (
          <button
            key={u}
            className="urgentbtn"
            onClick={() => {
              speak(u, profile.voiceName);
              recordSpoken({ text: u, method, msToMessage: 0, edited: false, urgent: true, at: Date.now() });
            }}
          >
            {u}
          </button>
        ))}
        <span className="dim">Fixed messages · never AI-generated</span>
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
