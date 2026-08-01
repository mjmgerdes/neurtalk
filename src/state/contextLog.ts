import type { SceneContext } from "../types";

// Log of what the visual-context layer observed, so the user can always see
// (and delete) what informed their suggestions. On-device only.

export interface ContextEntry {
  ctx: SceneContext;
  source: "phone" | "laptop" | "demo";
  at: number;
}

const KEY = "neurtalk.contextlog.v1";

export function loadContextLog(): ContextEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ContextEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordContext(e: ContextEntry) {
  localStorage.setItem(KEY, JSON.stringify([e, ...loadContextLog()].slice(0, 50)));
}

export function clearContextLog() {
  localStorage.removeItem(KEY);
}
