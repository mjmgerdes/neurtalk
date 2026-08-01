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

  return (
    <div className="screen history">
      <h1>Communication history</h1>
      <p className="sub">
        Recorded on this device only. Everything here can be deleted. The report is yours to share —
        or not.
      </p>

      <div className="contextrow">
        <button
          className="primary"
          onClick={() => setReport(buildAccessReport(entries, profile.corrections.length))}
        >
          Generate access report
        </button>
        <button onClick={download} disabled={entries.length === 0}>
          Download .txt
        </button>
        <button
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

      {entries.length === 0 && <p className="dim">Nothing spoken yet.</p>}
      {entries.map((e, i) => (
        <div className="card" key={i}>
          🔊 “{e.text}”
          <div className="dim">
            {new Date(e.at).toLocaleTimeString()} · {e.method}
            {e.urgent ? " · urgent (fixed message)" : ` · ${(e.msToMessage / 1000).toFixed(1)}s to speak`}
            {e.edited ? " · edited first" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
