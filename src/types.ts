// Core domain types for NeurTalk.

export interface Person {
  name: string;
  relationship: string;
  notes?: string;
}

export interface ObjectMemory {
  name: string;
  notes?: string;
}

export interface StyleProfile {
  preferredName: string;
  tone: string; // e.g. "direct but warm"
  quirks: string[]; // e.g. ['says "grab", not "bring"', 'starts requests with "Hey"']
}

export interface Correction {
  rejected: string;
  chosen: string;
  learned: string; // human-readable preference, e.g. '"grab" over "bring"'
  at: number;
}

export interface Profile {
  style: StyleProfile;
  people: Person[];
  objects: ObjectMemory[];
  phrases: string[]; // approved messages that "sound like me"
  corrections: Correction[];
  voiceSampleId?: string; // audio-bank id of the banked voice sample
  voiceName?: string; // chosen speechSynthesis voice (Personal Voice on macOS if present)
}

export interface SceneContext {
  people_present: string[];
  objects_visible: string[];
  location: string;
  activity: string;
  recent_prompt?: string;
}

export interface Candidate {
  text: string;
  intent: string; // e.g. "request", "decline", "social"
}

export type AccessMethod = "head" | "keys" | "switch";

export type SelectionSlot = 0 | 1 | 2; // left, center, right
