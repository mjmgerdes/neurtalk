import { useState } from "react";
import type { Profile } from "./types";
import { loadProfile } from "./state/profile";
import { Onboarding } from "./screens/Onboarding";
import { CommunicationMap } from "./screens/CommunicationMap";
import { Talk } from "./screens/Talk";
import { History } from "./screens/History";
import { PhoneCamera } from "./screens/PhoneCamera";
import { BrandMark, Icon } from "./components/Icon";

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

  const tabs: { id: Tab; label: string }[] = [
    { id: "talk", label: "Talk" },
    { id: "map", label: "My Map" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="appbar">
        <div className="appbar-inner">
          <span className="brand">
            <BrandMark />
            NeurTalk
          </span>
          <nav className="mainnav" aria-label="Primary">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "active" : ""}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <span className="device-note" title="Camera, reasoning and history stay on this device">
            <Icon name="lock" size={14} />
            On-device
          </span>
        </div>
      </header>
      <main id="main-content" className="workspace">
        {tab === "talk" && <Talk profile={profile} onProfileChange={setProfile} />}
        {tab === "map" && <CommunicationMap profile={profile} onProfileChange={setProfile} />}
        {tab === "history" && <History profile={profile} />}
      </main>
    </div>
  );
}
