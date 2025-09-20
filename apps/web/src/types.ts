// apps/web/src/types.ts
// Mirrors packages/schemas/src/character-lite.schema.json

export type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused";

export interface JobInfo {
  id?: string;
  state: JobState;
  progress?: number;
  returnvalue?: unknown;
  failedReason?: string;
  createdAt?: number | string;
  updatedAt?: number | string;
}

export type AgeRange =
  | "child"
  | "teen"
  | "young_adult"
  | "adult"
  | "middle_aged"
  | "elder";

export type HeightCategory = "short" | "average" | "tall";

export type Build =
  | "slim"
  | "average"
  | "muscular"
  | "heavy"
  | "lithe"
  | "stocky"
  | "other";

export type Gender = "male" | "female" | "nonbinary" | "unspecified";

export interface CharacterIdentity {
  char_name: string;
  char_slug?: string;
  archetype?: string;
  vibe?: string;
}

export interface CharacterPersonality {
  desire: string;
  fear: string;
  flaw: string;
  traits: string[];
  quirk?: string;
  values?: string[];
}

export interface CharacterPhysical {
  species?: string;
  age_range: AgeRange;
  gender: Gender;
  height_category: HeightCategory;
  build: Build;
  skin_tone: string;
  hair_color: string;
  hair_style?: string;
  eye_color: string;
  distinctive_features?: string[];
  aesthetic_vibe?: string;
}

export interface CharacterStats {
  creature_affinity: number;
  chaos_mastery: number;
  kinesthetic: number;
  lucidity: number;
  terrain_control: number;
}

export interface CharacterDefinitionLite {
  message?: string;
  client_ready: boolean;
  identity: CharacterIdentity;
  personality: CharacterPersonality;
  physical: CharacterPhysical;
  stats: CharacterStats;
}