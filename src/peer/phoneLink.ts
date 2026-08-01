import Peer, { type MediaConnection } from "peerjs";

// Phone-as-glasses link. The desktop (host) shows a QR code; the phone opens
// the hosted app in camera mode and streams its rear camera to the desktop
// over WebRTC. PeerJS's public broker is used only for signaling — the video
// itself flows peer-to-peer and is never uploaded to a server.

// The phone always opens the hosted (https) URL: camera access requires a
// secure context, which a LAN dev URL doesn't provide.
export const PHONE_BASE_URL = "https://mjmgerdes.github.io/neurtalk/";

type Status = "off" | "waiting" | "connected" | "error";

interface HostState {
  peer: Peer | null;
  peerId: string;
  status: Status;
  stream: MediaStream | null;
  listeners: Set<() => void>;
}

// Module singleton so the phone link survives navigation between screens.
const host: HostState = {
  peer: null,
  peerId: "",
  status: "off",
  stream: null,
  listeners: new Set(),
};

function notify() {
  host.listeners.forEach((l) => l());
}

export function subscribePhoneLink(cb: () => void): () => void {
  host.listeners.add(cb);
  return () => host.listeners.delete(cb);
}

export function phoneLinkStatus(): Status {
  return host.status;
}

export function phoneStream(): MediaStream | null {
  return host.stream;
}

export function phoneJoinUrl(): string {
  return `${PHONE_BASE_URL}?mode=camera&peer=${host.peerId}`;
}

/** Start (or reuse) the desktop host peer awaiting a phone connection. */
export function startHost(): void {
  if (host.peer) return;
  host.peerId = "neurtalk-" + Math.random().toString(36).slice(2, 8);
  const peer = new Peer(host.peerId);
  host.peer = peer;
  host.status = "waiting";
  notify();
  peer.on("call", (call: MediaConnection) => {
    call.answer(); // receive-only
    call.on("stream", (remote) => {
      host.stream = remote;
      host.status = "connected";
      notify();
    });
    call.on("close", () => {
      host.stream = null;
      host.status = "waiting";
      notify();
    });
  });
  peer.on("error", () => {
    host.status = "error";
    notify();
  });
  peer.on("disconnected", () => peer.reconnect());
}

/** Phone side: capture the rear camera and stream it to the desktop host. */
export async function startPhoneSender(
  hostId: string,
  previewVideo: HTMLVideoElement,
  onStatus: (s: string) => void
): Promise<void> {
  onStatus("Starting camera…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: 1280 },
    audio: false,
  });
  previewVideo.srcObject = stream;
  await previewVideo.play();
  onStatus("Connecting to your NeurTalk…");
  const peer = new Peer();
  peer.on("open", () => {
    peer.call(hostId, stream);
    onStatus("Streaming — this phone is now your visual input");
  });
  peer.on("error", (e) => onStatus(`Connection error: ${e.type}. Refresh to retry.`));
}
