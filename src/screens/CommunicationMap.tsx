import type { Profile } from "../types";

interface Props {
  profile: Profile;
}

/**
 * Transparent view of everything the system knows — every memory reviewable,
 * grouped by category. No opaque "how well we know you" score.
 */
export function CommunicationMap({ profile }: Props) {
  return (
    <div className="screen map">
      <h1>Communication map</h1>
      <p className="sub">Everything NeurTalk knows about how {profile.style.preferredName} communicates. Stored on-device.</p>

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
        <h2>People</h2>
        {profile.people.map((p) => (
          <div className="card" key={p.name}>
            <b>{p.name}</b> — {p.relationship}
            {p.notes && <div className="dim">{p.notes}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2>Objects & routines</h2>
        {profile.objects.map((o) => (
          <div className="card" key={o.name}>
            <b>{o.name}</b>
            {o.notes && <div className="dim">{o.notes}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2>Approved phrases</h2>
        {profile.phrases.map((ph) => (
          <div className="card" key={ph}>
            “{ph}”
          </div>
        ))}
      </section>

      <section>
        <h2>Learned preferences</h2>
        {profile.corrections.length === 0 && <p className="dim">None yet — the bank learns from your selections and edits, not from listening.</p>}
        {profile.corrections.map((c, i) => (
          <div className="card learned" key={i}>
            ✦ Prefers <b>“{c.chosen}”</b> over “{c.rejected}” <span className="dim">({c.learned})</span>
          </div>
        ))}
      </section>
    </div>
  );
}
