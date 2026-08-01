import { useEffect, useState } from "react";
import type { Profile } from "../types";
import { saveProfile } from "../state/profile";
import { deleteAudio, getAudioUrl, listAudio, type AudioItem } from "../state/audioBank";

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

  useEffect(() => {
    listAudio().then(setBank);
  }, []);

  function update(next: Profile) {
    saveProfile(next);
    onProfileChange(next);
  }

  return (
    <div className="screen map">
      <h1>Communication map</h1>
      <p className="sub">
        Everything NeurTalk knows about how {profile.style.preferredName} communicates. Stored
        on-device. Every memory can be removed.
      </p>

      <section>
        <h2>Style</h2>
        <div className="chips">
          <span className="chip">{profile.style.tone}</span>
          {profile.style.quirks.map((q) => (
            <span className="chip" key={q}>
              {q}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2>Audio bank</h2>
        {bank.length === 0 && <p className="dim">No banked audio yet — add some from onboarding.</p>}
        {bank.map((a) => (
          <div className="card row" key={a.id}>
            <div>
              {a.kind === "voice-sample" ? "🎙" : a.kind === "upload" ? "📁" : "🔴"} <b>{a.label}</b>
              <div className="dim">
                {a.kind} · {a.duration >= 1 ? `${Math.round(a.duration)}s` : "—"}
              </div>
              {playing?.id === a.id && <audio controls autoPlay src={playing.url} />}
            </div>
            <div>
              <button
                className="link"
                onClick={async () => {
                  const url = await getAudioUrl(a.id);
                  if (url) setPlaying({ id: a.id, url });
                }}
              >
                play
              </button>{" "}
              <button
                className="link"
                onClick={async () => {
                  await deleteAudio(a.id);
                  setBank(await listAudio());
                }}
              >
                remove
              </button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2>People</h2>
        {profile.people.map((p) => (
          <div className="card row" key={p.name}>
            <div>
              <b>{p.name}</b> — {p.relationship}
              {p.notes && <div className="dim">{p.notes}</div>}
            </div>
            <button
              className="link"
              onClick={() => update({ ...profile, people: profile.people.filter((x) => x !== p) })}
            >
              remove
            </button>
          </div>
        ))}
        <div className="addrow">
          <input
            placeholder="Name"
            value={newPerson.name}
            onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
          />
          <input
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
            Add person
          </button>
        </div>
      </section>

      <section>
        <h2>Objects & routines</h2>
        {profile.objects.map((o) => (
          <div className="card row" key={o.name}>
            <div>
              <b>{o.name}</b>
              {o.notes && <div className="dim">{o.notes}</div>}
            </div>
            <button
              className="link"
              onClick={() => update({ ...profile, objects: profile.objects.filter((x) => x !== o) })}
            >
              remove
            </button>
          </div>
        ))}
        <div className="addrow">
          <input placeholder="Object or routine" value={newObject} onChange={(e) => setNewObject(e.target.value)} />
          <button
            disabled={!newObject.trim()}
            onClick={() => {
              update({ ...profile, objects: [...profile.objects, { name: newObject.trim() }] });
              setNewObject("");
            }}
          >
            Add object
          </button>
        </div>
      </section>

      <section>
        <h2>Approved phrases</h2>
        {profile.phrases.map((ph) => (
          <div className="card row" key={ph}>
            <div>“{ph}”</div>
            <button
              className="link"
              onClick={() => update({ ...profile, phrases: profile.phrases.filter((x) => x !== ph) })}
            >
              remove
            </button>
          </div>
        ))}
        <div className="addrow">
          <input
            placeholder='A phrase that sounds like you, e.g. "Hey, one sec."'
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
            Add phrase
          </button>
        </div>
      </section>

      <section>
        <h2>Learned preferences</h2>
        {profile.corrections.length === 0 && (
          <p className="dim">None yet — the bank learns from your selections and edits, not from listening.</p>
        )}
        {profile.corrections.map((c, i) => (
          <div className="card learned row" key={i}>
            <div>
              ✦ Prefers <b>“{c.chosen}”</b> over “{c.rejected}” <span className="dim">({c.learned})</span>
            </div>
            <button
              className="link"
              onClick={() =>
                update({ ...profile, corrections: profile.corrections.filter((_, j) => j !== i) })
              }
            >
              remove
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
