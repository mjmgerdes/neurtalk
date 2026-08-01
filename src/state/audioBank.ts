// On-device audio bank: the user's voice sample plus contextual audio they
// explicitly contribute (uploads or intentional recordings). Blobs live in
// IndexedDB; nothing is uploaded anywhere.

export type AudioKind = "voice-sample" | "upload" | "recording";

export interface AudioItem {
  id: string;
  label: string;
  kind: AudioKind;
  mime: string;
  duration: number; // seconds, 0 if unknown
  addedAt: number;
  transcript?: string; // on-device Whisper transcript, once parsed
}

const DB = "neurtalk";
const STORE = "audio";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "meta.id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function addAudio(blob: Blob, meta: AudioItem): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").put({ meta, blob });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listAudio(): Promise<AudioItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as { meta: AudioItem }[]).map((r) => r.meta).sort((a, b) => b.addedAt - a.addedAt)
      );
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioUrl(id: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(id);
    req.onsuccess = () => resolve(req.result ? URL.createObjectURL(req.result.blob) : null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

export async function updateAudioMeta(id: string, patch: Partial<AudioItem>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const store = tx(db, "readwrite");
    const get = store.get(id);
    get.onsuccess = () => {
      if (!get.result) return resolve();
      const next = { ...get.result, meta: { ...get.result.meta, ...patch } };
      const put = store.put(next);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Read a media file/blob's duration via a detached media element (works for audio and video containers). */
export function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    const url = URL.createObjectURL(blob);
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(el.duration) ? el.duration : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}
