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
      setMsg("On-device transcription failed — you can type/paste the transcript below.");
    }
  }

  async function extract() {
    setMsg("Gemma is parsing your speech patterns…");
    try {
      const s = await extractSemantics(transcript);
      setSem(s);
      setMsg(null);
      await updateAudioMeta(item.id, { transcript });
      onMined(s, transcript);
    } catch (e) {
      console.error(e);
      setMsg("Gemma unavailable — is Ollama running?");
    }
  }

  if (!open && !item.transcript)
    return (
      <button className="link" onClick={transcribe}>
        transcribe &amp; map
      </button>
    );
  if (!open)
    return (
      <button className="link" onClick={() => setOpen(true)}>
        view transcript
      </button>
    );

  return (
    <div className="miner">
      {msg && <p className="dim">{msg}</p>}
      <textarea
        rows={3}
        placeholder="Transcript appears here — editable before mapping"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />
      <div className="minerrow">
        <button className="primary" disabled={!transcript.trim()} onClick={extract}>
          Extract semantics with Gemma
        </button>
        {!item.transcript && (
          <button className="link" onClick={transcribe}>
            re-transcribe
          </button>
        )}
        <button className="link" onClick={() => setOpen(false)}>
          close
        </button>
      </div>
      {sem && (
        <div className="minerout">
          {sem.expressions.map((x) => (
            <span className="chip learnedchip" key={x}>
              ✦ {x}
            </span>
          ))}
          {sem.quirks.map((x) => (
            <span className="chip" key={x}>
              {x}
            </span>
          ))}
          {sem.people.map((p) => (
            <span className="chip person" key={p.name}>
              👤 {p.name} ({p.relationship})
            </span>
          ))}
          <p className="dim">✓ Added to your semantic map</p>
        </div>
      )}
    </div>
  );
}
