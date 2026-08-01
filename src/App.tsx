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
  const [profile, setProfile] = useState<Profile | null>(loadProfile());
  const [tab, setTab] = useState<Tab>("talk");

  // Scanned from the QR code: this device is the camera, not the interface.
  if (new URLSearchParams(location.search).get("mode") === "camera") return <PhoneCamera />;

  if (!profile) return <Onboarding onDone={setProfile} />;

  return (
    <div className="app">
      <nav>
        <span className="brand">NeurTalk</span>
        <button className={tab === "talk" ? "active" : ""} onClick={() => setTab("talk")}>
          Talk
        </button>
        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>
          Communication map
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          History
        </button>
        <span className="tagline">Context proposes. The person disposes.</span>
      </nav>
      {tab === "talk" && <Talk profile={profile} onProfileChange={setProfile} />}
      {tab === "map" && <CommunicationMap profile={profile} onProfileChange={setProfile} />}
      {tab === "history" && <History profile={profile} />}
    </div>
  );
}
