import { useEffect, useState } from "react";
import type { Profile } from "../types";
import { saveProfile } from "../state/profile";
import { deleteAudio, getAudioUrl, listAudio, type AudioItem } from "../state/audioBank";
import { SemanticMiner } from "../components/SemanticMiner";
import type { ExtractedSemantics } from "../llm/gemma";
import { clearContextLog, loadContextLog, type ContextEntry } from "../state/contextLog";
import { VoiceSettings } from "../components/VoiceSettings";
import { Icon } from "../components/Icon";

interface Props {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
}

/**
 * Transparent view of everything the system knows — every memory reviewable,
 * editable, and deletable. No opaque "how well we know you" score.
 */
export function CommunicationMap({ profile, onProfileChange }: Props) {
  const [newPerson, setNewPerson] = useState({ name: "", relationship: "" });
  const [newObject, setNewObject] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [bank, setBank] = useState<AudioItem[]>([]);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);

  const [ctxLog, setCtxLog] = useState<ContextEntry[]>([]);

  useEffect(() => {
    listAudio().then(setBank);
    setCtxLog(loadContextLog());
  }, []);

  function update(next: Profile) {
    saveProfile(next);
    onProfileChange(next);
  }

  // Semantics mined post-onboarding merge straight into the saved profile.
  function onMined(s: ExtractedSemantics) {
    update({
      ...profile,
      expressions: [...new Set([...profile.expressions, ...s.expressions])],
      style: { ...profile.style, quirks: [...new Set([...profile.style.quirks, ...s.quirks])] },
      people: [
        ...profile.people,
        ...s.people
          .filter((p) => !profile.people.some((x) => x.name.toLowerCase() === p.name.toLowerCase()))
          .map((p) => ({ name: p.name, relationship: p.relationship || "—" })),
      ],
    });
  }

  const kindLabel = (k: AudioItem["kind"]) =>
    k === "voice-sample" ? "Voice sample" : k === "upload" ? "Upload" : "Recording";

  return (
    <div className="screen map">
      <header className="page-head">
        <h1>My Map</h1>
        <p className="lede">
          Everything NeurTalk knows about how {profile.style.preferredName} communicates. It stays on
          this device, and you can remove any of it.
        </p>
      </header>

      <div className="map-grid">
        <VoiceSettings />

        <section className="block" aria-labelledby="style-h">
          <h2 id="style-h">Style</h2>
          <ul className="tags">
            <li className="tag">{profile.style.tone}</li>
            {profile.style.quirks.map((q) => (
              <li className="tag" key={q}>
                {q}
              </li>
            ))}
          </ul>
        </section>

        <section className="block" aria-labelledby="expr-h">
          <h2 id="expr-h">Your expressions</h2>
          {profile.expressions.length === 0 ? (
            <p className="hint">
              None yet. Transcribe audio in your audio bank and NeurTalk finds the phrases that are
              distinctly yours. A blank (___) is filled from what the camera sees.
            </p>
          ) : (
            <ul className="tags">
              {profile.expressions.map((x) => (
                <li className="tag is-accent" key={x}>
                  {x}
                  <button
                    className="tag-remove"
                    aria-label={`Remove expression ${x}`}
                    onClick={() => update({ ...profile, expressions: profile.expressions.filter((e) => e !== x) })}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="block" aria-labelledby="bank-h">
          <h2 id="bank-h">Audio bank</h2>
          {bank.length === 0 && <p className="hint">No audio yet. Add recordings during setup.</p>}
          <ul className="rows">
            {bank.map((a) => (
              <li className="row-item is-stacked" key={a.id}>
                <div className="row-line">
                  <div>
                    <strong>{a.label}</strong>
                    <span className="meta">
                      {kindLabel(a.kind)} · {a.duration >= 1 ? `${Math.round(a.duration)}s` : "—"}
                    </span>
                  </div>
                  <div className="row-actions">
                    <button
                      className="link"
                      onClick={async () => {
                        const url = await getAudioUrl(a.id);
                        if (url) setPlaying({ id: a.id, url });
                      }}
                    >
                      Play
                    </button>
                    <button
                      className="link"
                      onClick={async () => {
                        await deleteAudio(a.id);
                        setBank(await listAudio());
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {playing?.id === a.id && <audio controls autoPlay src={playing.url} />}
                <SemanticMiner item={a} onMined={onMined} />
              </li>
            ))}
          </ul>
        </section>

        <section className="block" aria-labelledby="ctx-h">
          <div className="block-head">
            <h2 id="ctx-h">What the camera saw</h2>
            {ctxLog.length > 0 && (
              <button
                className="link"
                onClick={() => {
                  clearContextLog();
                  setCtxLog([]);
                }}
              >
                Clear
              </button>
            )}
          </div>
          {ctxLog.length === 0 && <p className="hint">Nothing yet. Each time you ask for suggestions, the scene is logged here.</p>}
          <ul className="rows">
            {ctxLog.slice(0, 8).map((e, i) => (
              <li className="row-item is-stacked" key={i}>
                <span>
                  {[e.ctx.people_present.join(", ") || "No one", e.ctx.objects_visible.join(", ") || "no objects", e.ctx.location]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="meta">
                  {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {e.source === "phone" ? "Phone camera" : e.source === "laptop" ? "Computer camera" : "Sample scene"}
                  {e.ctx.activity ? ` · ${e.ctx.activity}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="block" aria-labelledby="people-h">
          <h2 id="people-h">People</h2>
          <ul className="rows">
            {profile.people.map((p) => (
              <li className="row-item" key={p.name}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="meta">{p.relationship}</span>
                  {p.notes && <span className="meta">{p.notes}</span>}
                </div>
                <button
                  className="link"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => update({ ...profile, people: profile.people.filter((x) => x !== p) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="addrow">
            <input
              aria-label="Name"
              placeholder="Name"
              value={newPerson.name}
              onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
            />
            <input
              aria-label="Relationship"
              placeholder="Relationship"
              value={newPerson.relationship}
              onChange={(e) => setNewPerson({ ...newPerson, relationship: e.target.value })}
            />
            <button
              disabled={!newPerson.name.trim()}
              onClick={() => {
                update({
                  ...profile,
                  people: [...profile.people, { name: newPerson.name.trim(), relationship: newPerson.relationship.trim() || "—" }],
                });
                setNewPerson({ name: "", relationship: "" });
              }}
            >
              Add
            </button>
          </div>
        </section>

        <section className="block" aria-labelledby="objects-h">
          <h2 id="objects-h">Objects and routines</h2>
          <ul className="rows">
            {profile.objects.map((o) => (
              <li className="row-item" key={o.name}>
                <div>
                  <strong>{o.name}</strong>
                  {o.notes && <span className="meta">{o.notes}</span>}
                </div>
                <button
                  className="link"
                  aria-label={`Remove ${o.name}`}
                  onClick={() => update({ ...profile, objects: profile.objects.filter((x) => x !== o) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="addrow">
            <input
              aria-label="Object or routine"
              placeholder="Object or routine"
              value={newObject}
              onChange={(e) => setNewObject(e.target.value)}
            />
            <button
              disabled={!newObject.trim()}
              onClick={() => {
                update({ ...profile, objects: [...profile.objects, { name: newObject.trim() }] });
                setNewObject("");
              }}
            >
              Add
            </button>
          </div>
        </section>

        <section className="block" aria-labelledby="phrases-h">
          <h2 id="phrases-h">Approved phrases</h2>
          <ul className="rows">
            {profile.phrases.map((ph) => (
              <li className="row-item" key={ph}>
                <span>“{ph}”</span>
                <button
                  className="link"
                  aria-label={`Remove phrase ${ph}`}
                  onClick={() => update({ ...profile, phrases: profile.phrases.filter((x) => x !== ph) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="addrow">
            <input
              aria-label="New phrase"
              placeholder="A phrase that sounds like you, e.g. “Hey, one sec.”"
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
            />
            <button
              disabled={!newPhrase.trim()}
              onClick={() => {
                update({ ...profile, phrases: [...profile.phrases, newPhrase.trim()] });
                setNewPhrase("");
              }}
            >
              Add
            </button>
          </div>
        </section>

        <section className="block" aria-labelledby="learned-h">
          <h2 id="learned-h">Learned preferences</h2>
          {profile.corrections.length === 0 && (
            <p className="hint">None yet. NeurTalk learns from the responses you edit, not from listening.</p>
          )}
          <ul className="rows">
            {profile.corrections.map((c, i) => (
              <li className="row-item" key={i}>
                <div>
                  <span>
                    Prefers <strong>“{c.chosen}”</strong> over “{c.rejected}”
                  </span>
                  <span className="meta">{c.learned}</span>
                </div>
                <button
                  className="link"
                  onClick={() => update({ ...profile, corrections: profile.corrections.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
