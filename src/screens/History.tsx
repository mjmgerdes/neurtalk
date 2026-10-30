import { useState } from "react";
import type { Profile } from "../types";
import { buildAccessReport, clearHistory, loadHistory, type SpokenEntry } from "../state/history";

interface Props {
  profile: Profile;
}

/**
 * Communication history & insights. Recorded on-device, user-deletable.
 * The Access Report is descriptive only — something the user can choose to
 * share with an SLP or care team. No diagnoses, no clinical notes.
 */
export function History({ profile }: Props) {
  const [entries, setEntries] = useState<SpokenEntry[]>(loadHistory());
  const [report, setReport] = useState<string | null>(null);

  function download() {
    const text = report ?? buildAccessReport(entries, profile.corrections.length);
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "neurtalk-access-report.txt";
    a.click();
  }

  const methodLabel = { head: "Head control", keys: "Keyboard", switch: "Single switch" } as const;

  return (
    <div className="screen history">
      <header className="page-head">
        <h1>History</h1>
        <p className="lede">
          What you've said, recorded on this device only. Delete it anytime. The access report is yours
          to share with a speech therapist or care team, or not.
        </p>
      </header>

      <div className="actions">
        <button
          className="primary"
          onClick={() => setReport(buildAccessReport(entries, profile.corrections.length))}
        >
          Create access report
        </button>
        <button onClick={download} disabled={entries.length === 0}>
          Download as text
        </button>
        <button
          className="danger-quiet"
          onClick={() => {
            setEntries(clearHistory());
            setReport(null);
          }}
          disabled={entries.length === 0}
        >
          Delete all history
        </button>
      </div>

      {report && <pre className="report">{report}</pre>}

      <section className="block" aria-labelledby="spoken-h">
        <h2 id="spoken-h">Spoken</h2>
        {entries.length === 0 && <p className="hint">Nothing spoken yet. Responses you speak on Talk appear here.</p>}
        <ul className="rows">
          {entries.map((e, i) => (
            <li className="row-item is-stacked" key={i}>
              <span className="history-text">“{e.text}”</span>
              <span className="meta">
                {new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {" · "}
                {methodLabel[e.method] ?? e.method}
                {e.urgent ? " · Urgent phrase" : ` · ${(e.msToMessage / 1000).toFixed(1)}s to speak`}
                {e.edited ? " · Edited first" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
