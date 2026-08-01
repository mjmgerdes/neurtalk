import { useEffect, useRef, useState } from "react";
import type { Candidate, SelectionSlot } from "../types";
import { startPhoneSender, type LinkMessage } from "../peer/phoneLink";

/**
 * The phone after scanning the QR: a stand-in for smart glasses. Fullscreen
 * rear-camera view with the three candidate messages overlaid like an AR HUD.
 * Tilting the phone (as the wearer's head) left/right highlights an option;
 * a nod (tip down and back) confirms. Intents are sent to the desktop, which
 * runs the brain and speaks; the HUD mirrors every state change.
 */

const YAW_THRESHOLD = 15; // degrees off neutral = left/right
const NOD_THRESHOLD = 14; // degrees downward pitch delta = nod
const NOD_RESET_MS = 900;

function angleDelta(a: number, b: number): number {
  // shortest signed distance between two compass angles
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function PhoneCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Tap Start — then hold the phone up like your glasses");
  const [started, setStarted] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [highlighted, setHighlighted] = useState<SelectionSlot>(1);
  const [stage, setStage] = useState<"choosing" | "confirming">("choosing");
  const [spoken, setSpoken] = useState<string | null>(null);
  const [debug, setDebug] = useState("");
  const hostId = new URLSearchParams(location.search).get("peer") ?? "";

  const sendRef = useRef<(m: LinkMessage) => void>(() => {});
  const stateRef = useRef({ candidates, highlighted, stage });
  stateRef.current = { candidates, highlighted, stage };
  const neutral = useRef<{ alpha: number; pitch: number } | null>(null);
  const nodArmed = useRef(true);
  const nodStarted = useRef(0);

  function handleMessage(m: LinkMessage) {
    switch (m.type) {
      case "candidates":
        setCandidates(m.candidates as Candidate[]);
        setHighlighted((m.highlighted as SelectionSlot) ?? 1);
        setStage("choosing");
        setSpoken(null);
        neutral.current = null; // recalibrate to however they're holding it now
        break;
      case "highlight":
        setHighlighted(m.slot as SelectionSlot);
        break;
      case "stage":
        setStage(m.stage as "choosing" | "confirming");
        if (m.slot !== undefined) setHighlighted(m.slot as SelectionSlot);
        break;
      case "spoken":
        setSpoken(m.text as string);
        setCandidates(null);
        setStage("choosing");
        break;
      case "clear":
        setCandidates(null);
        setSpoken(null);
        setStage("choosing");
        break;
    }
  }

  function handleOrientation(e: DeviceOrientationEvent) {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const landscape = Math.abs(window.orientation ?? (screen.orientation?.angle || 0)) === 90;
    // alpha = rotation about vertical axis: works as "head yaw" in any grip.
    // pitch axis depends on grip: beta in portrait, gamma in landscape.
    const rawPitch = landscape ? Math.abs(e.gamma) : e.beta;
    if (!neutral.current) neutral.current = { alpha: e.alpha, pitch: rawPitch };
    const yaw = angleDelta(e.alpha, neutral.current.alpha);
    const pitch = neutral.current.pitch - rawPitch; // positive = tipped down (toward ground)
    setDebug(`yaw ${yaw.toFixed(0)}° pitch ${pitch.toFixed(0)}°`);

    const st = stateRef.current;
    if (!st.candidates) return;

    if (st.stage === "choosing") {
      // alpha increases counter-clockwise: turning left = positive delta
      const slot: SelectionSlot = yaw > YAW_THRESHOLD ? 0 : yaw < -YAW_THRESHOLD ? 2 : 1;
      if (slot !== st.highlighted) {
        setHighlighted(slot);
        sendRef.current({ type: "highlight", slot });
      }
    }
    // Nod: tip down past threshold, then return quickly.
    if (nodArmed.current && pitch > NOD_THRESHOLD) {
      nodArmed.current = false;
      nodStarted.current = performance.now();
    } else if (!nodArmed.current && pitch < NOD_THRESHOLD * 0.4) {
      const quick = performance.now() - nodStarted.current < NOD_RESET_MS;
      nodArmed.current = true;
      if (quick) sendRef.current({ type: "confirm" });
    }
  }

  async function start() {
    if (!videoRef.current || started) return;
    setStarted(true);
    try {
      // iOS requires an explicit permission request from a user gesture.
      const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof doe.requestPermission === "function") await doe.requestPermission();
      window.addEventListener("deviceorientation", handleOrientation);
      const { send } = await startPhoneSender(hostId, videoRef.current, setStatus, handleMessage);
      sendRef.current = send;
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`);
      setStarted(false);
    }
  }

  useEffect(() => {
    if (!hostId) setStatus("Missing session code — rescan the QR from NeurTalk.");
    return () => window.removeEventListener("deviceorientation", handleOrientation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  return (
    <div className="phonecam">
      <video ref={videoRef} muted playsInline />

      {/* AR-style HUD overlay */}
      {candidates && stage === "choosing" && (
        <div className="hud">
          {candidates.map((c, i) => (
            <div key={i} className={`hudcard pos${i} ${highlighted === i ? "hudlit" : ""}`}>
              {c.text}
            </div>
          ))}
          <div className="hudhint">tilt to choose · nod to select</div>
        </div>
      )}
      {candidates && stage === "confirming" && (
        <div className="hud confirm">
          <div className="hudconfirm">
            <div className="hudtext">“{candidates[highlighted].text}”</div>
            <div className="hudask">Speak this? Nod again.</div>
          </div>
        </div>
      )}
      {spoken && (
        <div className="hud confirm">
          <div className="hudconfirm spoken">🔊 “{spoken}”</div>
        </div>
      )}

      {started && <div className="huddebug">{debug}</div>}

      {(!started || status) && (
        <div className="phonecam-overlay" onClick={start}>
          <b>NeurTalk — glasses view</b>
          <span>{status}</span>
          {!started && hostId && <button className="big primary">Start streaming</button>}
        </div>
      )}
    </div>
  );
}
