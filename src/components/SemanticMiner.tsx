import { useState } from "react";
import { getAudioBlob, updateAudioMeta, type AudioItem } from "../state/audioBank";
import { transcribeBlob } from "../audio/transcribe";
import { extractSemantics, type ExtractedSemantics } from "../llm/gemma";

interface Props {
  item: AudioItem;
  onMined: (sem: ExtractedSemantics, transcript: string) => void;
}

/**
 * Audio item -> on-device Whisper transcript (editable) -> Gemma semantic
 * extraction -> merged into the user's semantic map by the parent screen.
 */
export function SemanticMiner({ item, onMined }: Props) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState(item.transcript ?? "");
  const [sem, setSem] = useState<ExtractedSemantics | null>(null);

  async function transcribe() {
    setOpen(true);
    setMsg("Loading…");
    try {
      const blob = await getAudioBlob(item.id);
      if (!blob) throw new Error("audio missing");
      const text = await transcribeBlob(blob, setMsg);
      setTranscript(text);
      await updateAudioMeta(item.id, { transcript: text });
      setMsg(null);
    } catch (e) {
      console.error(e);
      setMsg("Transcription didn’t work. You can type or paste the words below.");
    }
  }

  async function extract() {
    setMsg("Finding your expressions…");
    try {
      const s = await extractSemantics(transcript);
      setSem(s);
      setMsg(null);
      await updateAudioMeta(item.id, { transcript });
      onMined(s, transcript);
    } catch (e) {
      console.error(e);
      setMsg("The on-device model isn’t running. Start Ollama and try again.");
    }
  }

  if (!open && !item.transcript)
    return (
      <button className="link" onClick={transcribe}>
        Transcribe and find expressions
      </button>
    );
  if (!open)
    return (
      <button className="link" onClick={() => setOpen(true)}>
        View transcript
      </button>
    );

  return (
    <div className="miner">
      {msg && (
        <p className="hint" role="status">
          {msg}
        </p>
      )}
      <textarea
        rows={3}
        aria-label={`Transcript of ${item.label}`}
        placeholder="The transcript appears here. You can correct it first."
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />
      <div className="actions">
        <button className="primary" disabled={!transcript.trim()} onClick={extract}>
          Find expressions
        </button>
        {!item.transcript && (
          <button className="link" onClick={transcribe}>
            Transcribe again
          </button>
        )}
        <button className="link" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {sem && (
        <div className="miner-result">
          <ul className="tags">
            {sem.expressions.map((x) => (
              <li className="tag is-accent" key={x}>
                {x}
              </li>
            ))}
            {sem.quirks.map((x) => (
              <li className="tag" key={x}>
                {x}
              </li>
            ))}
            {sem.people.map((p) => (
              <li className="tag" key={p.name}>
                {p.name} ({p.relationship})
              </li>
            ))}
          </ul>
          <p className="hint">Added to My Map.</p>
        </div>
      )}
    </div>
  );
}
