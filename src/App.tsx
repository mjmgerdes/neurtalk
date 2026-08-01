import { useState } from "react";
import type { Profile } from "./types";
import { loadProfile } from "./state/profile";
import { Onboarding } from "./screens/Onboarding";
import { CommunicationMap } from "./screens/CommunicationMap";
import { Talk } from "./screens/Talk";
import { History } from "./screens/History";
import { PhoneCamera } from "./screens/PhoneCamera";

type Tab = "talk" | "map" | "history";

export default function App() {
  // Demo-first: every open starts at onboarding. `?resume=1` skips to the
  // saved profile (handy mid-demo after an accidental reload).
  const [profile, setProfile] = useState<Profile | null>(() =>
    new URLSearchParams(location.search).get("resume") ? loadProfile() : null
  );
  const [tab, setTab] = useState<Tab>("talk");

  // Scanned from the QR code: this device is the camera, not the interface.
  if (new URLSearchParams(location.search).get("mode") === "camera") return <PhoneCamera />;

  if (!profile) return <Onboarding onDone={setProfile} />;

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <div className="brand-lockup" aria-label="NeurTalk home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong className="brand">NeurTalk</strong>
            <small>Adaptive communication</small>
          </span>
        </div>
        <nav className="mainnav" aria-label="Primary navigation">
          <button
            className={tab === "talk" ? "active" : ""}
            aria-current={tab === "talk" ? "page" : undefined}
            onClick={() => setTab("talk")}
          >
            Talk
          </button>
          <button
            className={tab === "map" ? "active" : ""}
            aria-current={tab === "map" ? "page" : undefined}
            onClick={() => setTab("map")}
          >
            My map
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            aria-current={tab === "history" ? "page" : undefined}
            onClick={() => setTab("history")}
          >
            History
          </button>
        </nav>
        <span className="privacy-note"><i aria-hidden="true" /> Private &amp; on-device</span>
      </header>
      <main id="main-content">
        {tab === "talk" && <Talk profile={profile} onProfileChange={setProfile} />}
        {tab === "map" && <CommunicationMap profile={profile} onProfileChange={setProfile} />}
        {tab === "history" && <History profile={profile} />}
      </main>
      <footer className="app-footer">
        <span>Context proposes.</span>
        <span>The person disposes.</span>
      </footer>
    </div>
  );
}
