import type { AccessMethod } from "../types";

// Communication history, recorded only with explicit consent (the Talk screen
// shows a visible "history on" state). User can review and delete everything.

export interface SpokenEntry {
  text: string;
  method: AccessMethod;
  msToMessage: number; // candidates shown -> spoken
  edited: boolean;
  urgent: boolean;
  at: number;
}

const KEY = "neurtalk.history.v1";

export function loadHistory(): SpokenEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SpokenEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordSpoken(e: SpokenEntry): SpokenEntry[] {
  const next = [e, ...loadHistory()];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(): SpokenEntry[] {
  localStorage.removeItem(KEY);
  return [];
}

/**
 * Communication Access Report — plain-text summary a user can choose to share
 * with their SLP or care team. Descriptive only: no diagnoses, no treatment
 * recommendations, no clinical notes.
 */
export function buildAccessReport(entries: SpokenEntry[], correctionsCount: number): string {
  if (entries.length === 0) return "No communication history recorded yet.";
  const byMethod = new Map<string, number>();
  for (const e of entries) byMethod.set(e.method, (byMethod.get(e.method) ?? 0) + 1);
  const nonUrgent = entries.filter((e) => !e.urgent);
  const avgMs =
    nonUrgent.length > 0
      ? nonUrgent.reduce((s, e) => s + e.msToMessage, 0) / nonUrgent.length
      : 0;
  const editedPct =
    nonUrgent.length > 0
      ? Math.round((100 * nonUrgent.filter((e) => e.edited).length) / nonUrgent.length)
      : 0;
  const lines = [
    "NEURTALK COMMUNICATION ACCESS REPORT",
    `Generated ${new Date().toLocaleString()} — descriptive use only; not a clinical assessment.`,
    "",
    `Messages spoken: ${entries.length} (${entries.filter((e) => e.urgent).length} urgent fixed-message)`,
    `Access methods used: ${[...byMethod.entries()].map(([m, n]) => `${m} (${n})`).join(", ")}`,
    `Average time from options shown to message spoken: ${(avgMs / 1000).toFixed(1)}s`,
    `Messages edited before speaking: ${editedPct}%`,
    `Phrasing preferences learned to date: ${correctionsCount}`,
    "",
    "Recent messages:",
    ...entries.slice(0, 10).map((e) => `  - "${e.text}" (${e.method}${e.urgent ? ", urgent" : ""})`),
  ];
  return lines.join("\n");
}
