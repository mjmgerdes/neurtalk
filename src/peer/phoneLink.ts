import Peer, { type DataConnection, type MediaConnection } from "peerjs";

// Phone-as-glasses link. The desktop (host) shows a QR code; the phone opens
// the hosted app in camera mode, streams its rear camera to the desktop over
// WebRTC, and exchanges HUD state over a data channel. PeerJS's public broker
// is used only for signaling — video and data flow peer-to-peer.

// The phone always opens the hosted (https) URL: camera access requires a
// secure context, which a LAN dev URL doesn't provide.
export const PHONE_BASE_URL = "https://mjmgerdes.github.io/neurtalk/";

type Status = "off" | "waiting" | "connected" | "error";

// Messages desktop -> phone: HUD state to render over the wearer's view.
//   {type:"candidates", candidates:[{text,intent}], highlighted}
//   {type:"highlight", slot}
//   {type:"stage", stage:"choosing"|"confirming", slot}
//   {type:"spoken", text}
//   {type:"clear"}
// Messages phone -> desktop: wearer's intent from device orientation.
//   {type:"highlight", slot}
//   {type:"confirm"}
export type LinkMessage = Record<string, unknown> & { type: string };

interface HostState {
  peer: Peer | null;
  peerId: string;
  status: Status;
  stream: MediaStream | null;
  data: DataConnection | null;
  listeners: Set<() => void>;
  msgListeners: Set<(m: LinkMessage) => void>;
}

// Module singleton so the phone link survives navigation between screens.
const host: HostState = {
  peer: null,
  peerId: "",
  status: "off",
  stream: null,
  data: null,
  listeners: new Set(),
  msgListeners: new Set(),
};

function notify() {
  host.listeners.forEach((l) => l());
}

export function subscribePhoneLink(cb: () => void): () => void {
  host.listeners.add(cb);
  return () => host.listeners.delete(cb);
}

/** Subscribe to messages arriving from the phone (highlight/confirm intents). */
export function onPhoneMessage(cb: (m: LinkMessage) => void): () => void {
  host.msgListeners.add(cb);
  return () => host.msgListeners.delete(cb);
}

/** Push HUD state to the phone; no-op when no phone is connected. */
export function sendToPhone(m: LinkMessage) {
  try {
    host.data?.send(m);
  } catch {
    /* data channel closing is non-fatal */
  }
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
  peer.on("connection", (conn: DataConnection) => {
    host.data = conn;
    conn.on("data", (d) => {
      const m = d as LinkMessage;
      if (m && typeof m.type === "string") host.msgListeners.forEach((cb) => cb(m));
    });
    conn.on("close", () => {
      if (host.data === conn) host.data = null;
    });
  });
  peer.on("error", () => {
    host.status = "error";
    notify();
  });
  peer.on("disconnected", () => peer.reconnect());
}

/** Phone side: capture the rear camera, stream to the desktop, open data channel. */
export async function startPhoneSender(
  hostId: string,
  previewVideo: HTMLVideoElement,
  onStatus: (s: string) => void,
  onMessage: (m: LinkMessage) => void
): Promise<{ send: (m: LinkMessage) => void }> {
  onStatus("Starting camera…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: 1280 },
    audio: false,
  });
  previewVideo.srcObject = stream;
  await previewVideo.play();
  onStatus("Connecting to your NeurTalk…");
  const peer = new Peer();
  let data: DataConnection | null = null;
  await new Promise<void>((resolve, reject) => {
    peer.on("open", () => {
      peer.call(hostId, stream);
      data = peer.connect(hostId);
      data.on("open", () => {
        onStatus("");
        resolve();
      });
      data.on("data", (d) => {
        const m = d as LinkMessage;
        if (m && typeof m.type === "string") onMessage(m);
      });
    });
    peer.on("error", (e) => {
      onStatus(`Connection error: ${e.type}. Refresh to retry.`);
      reject(e);
    });
  });
  return {
    send: (m) => {
      try {
        data?.send(m);
      } catch {
        /* ignore */
      }
    },
  };
}
