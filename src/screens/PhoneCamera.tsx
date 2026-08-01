import { useEffect, useRef, useState } from "react";
import { startPhoneSender } from "../peer/phoneLink";

/**
 * What the phone shows after scanning the QR code: it becomes the "glasses" —
 * a rear-camera sender streaming the wearer's view to the NeurTalk interface.
 */
export function PhoneCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Tap to start");
  const [started, setStarted] = useState(false);
  const hostId = new URLSearchParams(location.search).get("peer") ?? "";

  // Camera + autoplay need a user gesture on mobile browsers.
  async function start() {
    if (!videoRef.current || started) return;
    setStarted(true);
    try {
      await startPhoneSender(hostId, videoRef.current, setStatus);
    } catch (e) {
      setStatus(`Camera failed: ${(e as Error).message}`);
      setStarted(false);
    }
  }

  useEffect(() => {
    if (!hostId) setStatus("Missing session code — rescan the QR from NeurTalk.");
  }, [hostId]);

  return (
    <div className="phonecam" onClick={start}>
      <video ref={videoRef} muted playsInline />
      <div className="phonecam-overlay">
        <b>NeurTalk visual input</b>
        <span>{status}</span>
        {!started && hostId && <button className="big primary">Start streaming</button>}
      </div>
    </div>
  );
}
