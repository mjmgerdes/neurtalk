import type { Correction, Profile } from "../types";

const KEY = "neurtalk.profile.v1";

export const DEMO_PROFILE: Profile = {
  style: {
    preferredName: "Maya",
    tone: "direct but warm",
    quirks: ['says "grab", not "bring"', 'often starts requests with "Hey"', "keeps it short when tired"],
  },
  people: [
    { name: "Sarah", relationship: "daughter", notes: "usually visits in the afternoon; helps with drinks and meals" },
    { name: "Pedro", relationship: "partner", notes: "handles evenings and medication reminders" },
  ],
  objects: [
    { name: "blue mug", notes: "morning coffee; usually in the kitchen" },
    { name: "red blanket", notes: "used when cold" },
  ],
  phrases: [
    "Hey Sarah, can you grab my blue mug?",
    "Can you move my left shoulder a little?",
    "Give me one second, I'm still thinking.",
    "That's not what I meant.",
  ],
  corrections: [],
};

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function addCorrection(p: Profile, c: Correction): Profile {
  const next = { ...p, corrections: [...p.corrections, c] };
  saveProfile(next);
  return next;
}

export function clearProfile() {
  localStorage.removeItem(KEY);
}
