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
  // Kept optional on the UI side so new/unsaved forms don't type-error.
  // Server/schema still requires it.
  char_slug?: string;
  archetype?: string;
  vibe?: string;
}

export interface CharacterPersonality {
  desire: string;
  fear: string;
  flaw: string;
  // Schema: min 2, max 6, unique — enforced server-side; UI trims on save.
  traits: string[];
  quirk?: string;
  // Schema: max 5, unique — enforced server-side; UI trims on save.
  values?: string[];
}

export interface CharacterPhysical {
  species?: string;
  age_range: AgeRange;
  gender: Gender;
  height_category: HeightCategory;
  build: Build;
  // colorOrNamed in schema → model as string here
  skin_tone: string;
  hair_color: string;
  hair_style?: string;
  eye_color: string;
  // Schema: max 6, unique — enforced server-side; UI trims on save.
  distinctive_features?: string[];
  aesthetic_vibe?: string;
}

export interface CharacterDefinitionLite {
  // Optional helper field from schema
  message?: string;
  client_ready: boolean;
  identity: CharacterIdentity;
  personality: CharacterPersonality;
  physical: CharacterPhysical;
}
