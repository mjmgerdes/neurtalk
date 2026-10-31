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
import { Icon, StatusDot } from "../components/Icon";
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

// Developer readouts (pose values, model id) only render with ?debug in the URL.
const DEBUG = new URLSearchParams(location.search).has("debug");

// Slot order is spatial: head turn left/center/right maps to slots 0/1/2.
const SLOT_DIRECTION = ["Turn left", "Look ahead", "Turn right"] as const;

const GUIDANCE: Record<AccessMethod, { move: string; speak: string; confirm: string }> = {
  head: { move: "Turn to select", speak: "Nod to speak", confirm: "Nod again to speak" },
  keys: { move: "Press 1, 2 or 3", speak: "Enter to speak", confirm: "Press Enter to speak, Esc to go back" },
  switch: { move: "Selection moves on its own", speak: "Space to speak", confirm: "Press Space to speak" },
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [camState, setCamState] = useState<"starting" | "live" | "error">("starting");
  const responsesRef = useRef<HTMLElement>(null);

  const sel = useSelection(method, candidates !== null && editing === null, async (slot, stage) => {
    if (!candidates) return;
    if (stage === "confirming") {
      const text = candidates[slot].text;
      sendToPhone({ type: "spoken", text });
      setSpeaking(text);
      try {
        await speak(text, profile.voiceName);
      } finally {
        setSpeaking(null);
      }
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
        setCamState("live");
      }
      const t = new HeadTracker();
      await t.init();
      t.onPose = (p) => {
        setPose(p);
        sel.feedPose(p);
      };
      if (videoRef.current) t.start(videoRef.current);
      trackerRef.current = t;
    })().catch((e) => {
      console.error("camera/tracker init failed", e);
      if (!videoRef.current?.srcObject) setCamState("error");
    });
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

  // Head and switch users can't scroll, so new suggestions are brought into view.
  useEffect(() => {
    if (candidates) {
      responsesRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    }
  }, [candidates]);

  // Pointer/touch (e.g. a caregiver): first press highlights, pressing the
  // highlighted response asks to speak it. Keyboard-originated clicks are
  // ignored in keys/switch mode, where the global key handlers already act.
  function onCandidateClick(e: React.MouseEvent, slot: SelectionSlot) {
    if (e.detail === 0 && method !== "head") return;
    if (sel.highlighted === slot) sel.confirmExternal();
    else sel.highlightExternal(slot);
  }

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
    setBusy("Looking at the scene…");
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
        setBusy("Writing suggestions…");
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
    flash(`Saved. NeurTalk will prefer ${learned}${expression ? `, and learned “${expression}”` : ""}.`);
  }

  const phoneConnected = phoneLinkStatus() === "connected";
  const guide = GUIDANCE[method];

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4500);
  }

  return (
    <div className="screen talk">
      <header className="page-head">
        <h1>Welcome to NeurTalk V0</h1>
        <p className="lede">
          Suggestions come from what was just said, what your camera sees, and the way you usually talk.
        </p>
      </header>

      <div className="toolbar">
        <dl className="toolbar-status" aria-label="Input and device status">
          <div className="tool">
            <dt>
              <label htmlFor="access-method">Input</label>
            </dt>
            <dd>
              <select id="access-method" value={method} onChange={(e) => setMethod(e.target.value as AccessMethod)}>
                <option value="head">Head control</option>
                <option value="keys">Keyboard</option>
                <option value="switch">Single switch</option>
              </select>
            </dd>
          </div>
          {method === "head" && (
            <div className="tool">
              <dt>Tracking</dt>
              <dd>
                <StatusDot ok={camState === "error" ? false : pose.faceDetected} />
                {camState === "error" ? "Camera unavailable" : pose.faceDetected ? "Face found" : "Looking for your face"}
              </dd>
            </div>
          )}
          <div className="tool">
            <dt>Phone camera</dt>
            <dd>
              <StatusDot ok={phoneConnected} />
              {phoneConnected ? "Connected" : "Not connected"}
            </dd>
          </div>
          <div className="tool">
            <dt>Suggestions</dt>
            <dd>
              <StatusDot ok={gemmaOnline} />
              {gemmaOnline === null ? "Checking…" : gemmaOnline ? "On-device model" : "Sample set, model offline"}
              {DEBUG && gemmaOnline && <code className="debug"> {MODEL}</code>}
            </dd>
          </div>
        </dl>
        {method === "head" && (
          <button
            className="toolbar-action"
            onClick={() => {
              trackerRef.current?.calibrate();
              flash("Neutral position set.");
            }}
            title="Look straight ahead, then press to set your resting position"
          >
            Calibrate
          </button>
        )}
      </div>

      <section className="block" aria-labelledby="context-heading">
        <h2 id="context-heading">Context</h2>
        <div className="feeds">
          <figure className="feed">
            <div className={`feed-frame${camState === "live" ? " is-live" : ""}`}>
              <video ref={videoRef} muted playsInline className="mirror" />
              {camState !== "live" && (
                <div className="feed-empty">
                  <p>{camState === "error" ? "Camera unavailable. Check browser permissions." : "Starting camera…"}</p>
                </div>
              )}
            </div>
            <figcaption>
              <strong>You</strong>
              <span>{method === "head" ? "Head tracking" : "Camera"}</span>
              {DEBUG && (
                <code className="debug">
                  yaw {pose.yaw.toFixed(3)} · pitch {pose.pitch.toFixed(3)} · ±{TUNING.yawThreshold}/{TUNING.nodThreshold}
                </code>
              )}
            </figcaption>
          </figure>

          <figure className="feed">
            <div className={`feed-frame${phoneConnected ? " is-live" : ""}`}>
              <video ref={sceneVideoRef} muted playsInline hidden={!phoneConnected} />
              {!phoneConnected && showQr && qr && (
                <div className="feed-empty feed-qr">
                  <img src={qr} alt="QR code to connect your phone" />
                  <div>
                    <p>Scan with your phone camera, then tap Start streaming.</p>
                    <code className="joinurl">{phoneJoinUrl()}</code>
                    <button className="link" onClick={() => setShowQr(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!phoneConnected && !(showQr && qr) && (
                <div className="feed-empty">
                  <Icon name="phone" size={20} />
                  <p>Use your phone as a wearable camera so NeurTalk sees what you see.</p>
                  <button onClick={connectPhone}>Connect phone</button>
                </div>
              )}
            </div>
            <figcaption>
              <strong>Your view</strong>
              <span>Phone camera</span>
            </figcaption>
          </figure>
        </div>

        {context && (
          <p className="seen">
            <span className="seen-label">Seen</span>
            <span>
              {[...context.people_present, ...context.objects_visible, context.location].filter(Boolean).join(" · ")}
            </span>
            {usedFallback && <span className="seen-note">Sample scene. The on-device model isn't running.</span>}
          </p>
        )}
      </section>

      <section className="block" aria-labelledby="heard-heading">
        <h2 id="heard-heading">
          <label htmlFor="last-heard">Last heard</label>
        </h2>
        <div className="heard-row">
          <input
            id="last-heard"
            value={recentPrompt}
            onChange={(e) => setRecentPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) readScene();
            }}
            placeholder="What did someone just say to you?"
          />
          <button className="primary big" onClick={readScene} disabled={!!busy} aria-busy={!!busy} aria-live="polite">
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {busy}
              </>
            ) : candidates ? (
              "Update suggestions"
            ) : (
              "Suggest replies"
            )}
          </button>
        </div>
      </section>

      <section className="block responses" ref={responsesRef} aria-labelledby="responses-heading">
        <div className="block-head">
          <h2 id="responses-heading">Suggested responses</h2>
          <p className="guidance">
            <span>{guide.move}</span>
            <span aria-hidden="true">·</span>
            <span>{guide.speak}</span>
          </p>
        </div>

        {speaking ? (
          <div className="speak-panel is-speaking" role="status">
            <p className="speak-label">
              <Icon name="speaker" />
              Speaking
            </p>
            <p className="speak-text">“{speaking}”</p>
          </div>
        ) : candidates && sel.stage === "confirming" ? (
          <div className="speak-panel" role="status">
            <p className="speak-label">
              <Icon name="check" />
              Ready to speak
            </p>
            <p className="speak-text">“{candidates[sel.highlighted].text}”</p>
            <div className="speak-actions">
              <button className="primary big" onClick={sel.confirmExternal}>
                <Icon name="speaker" />
                Speak
              </button>
              <button className="big" onClick={sel.cancel}>
                Back
              </button>
              <span className="guidance">{guide.confirm}</span>
            </div>
          </div>
        ) : candidates ? (
          <>
            <ol className="candidates">
              {candidates.map((c, i) => {
                const on = sel.highlighted === i;
                return (
                  <li key={i} className={`candidate${on ? " is-highlighted" : ""}`}>
                    <button
                      className="candidate-main"
                      onClick={(e) => onCandidateClick(e, i as SelectionSlot)}
                      aria-pressed={on}
                    >
                      <span className="candidate-meta">
                        <kbd className="slot-key">{i + 1}</kbd>
                        {method === "head" && <span>{SLOT_DIRECTION[i]}</span>}
                        {on && (
                          <span className="selected-tag">
                            <Icon name="check" size={14} />
                            Selected
                          </span>
                        )}
                      </span>
                      <span className="candidate-text">{c.text}</span>
                    </button>
                    <button
                      className="link candidate-edit"
                      onClick={() => startEdit(i as SelectionSlot)}
                      aria-label={`Edit response ${i + 1}`}
                    >
                      <Icon name="pencil" size={14} />
                      Edit
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="sr-only" aria-live="polite">
              Selected {sel.highlighted + 1}: {candidates[sel.highlighted].text}
            </p>
          </>
        ) : (
          <ol className="candidates is-empty" aria-label="No suggestions yet">
            {[0, 1, 2].map((i) => (
              <li key={i} className="candidate-placeholder">
                <kbd className="slot-key">{i + 1}</kbd>
                {method === "head" && <span>{SLOT_DIRECTION[i]}</span>}
              </li>
            ))}
            <li className="empty-note">Choose Suggest replies and three responses appear here.</li>
          </ol>
        )}

        {editing !== null && (
          <div className="editbox">
            <label htmlFor="edit-response">Edit response {editing + 1}</label>
            <textarea id="edit-response" value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus />
            <div className="editbox-actions">
              <button className="primary" onClick={saveEdit}>
                Save and remember
              </button>
              <button className="link" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <span className="hint">NeurTalk learns your wording from edits.</span>
            </div>
          </div>
        )}
      </section>

      <section className="block urgent" aria-labelledby="urgent-heading">
        <div className="block-head">
          <h2 id="urgent-heading">Urgent</h2>
          <p className="guidance">Spoken exactly as written</p>
        </div>
        <div className="urgent-row">
          {URGENT.map((u) => (
            <button
              key={u}
              className="urgent-btn"
              onClick={() => {
                speak(u, profile.voiceName);
                recordSpoken({ text: u, method, msToMessage: 0, edited: false, urgent: true, at: Date.now() });
              }}
            >
              <Icon name="alert" />
              {u}
            </button>
          ))}
        </div>
      </section>

      {spoken.length > 0 && (
        <section className="block" aria-labelledby="spoken-heading">
          <h2 id="spoken-heading">Spoken this session</h2>
          <ul className="plain-list">
            {spoken.map((s, i) => (
              <li key={i}>“{s}”</li>
            ))}
          </ul>
        </section>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
