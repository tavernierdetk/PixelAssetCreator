// packages/schemas/src/index.ts

import AjvImport, { type ValidateFunction, type ErrorObject } from "ajv";
import addFormatsImport from "ajv-formats";

// Normalize default/namespace interop so Ajv is constructable and addFormats is callable
const Ajv: any = (AjvImport as any).default ?? AjvImport;
const addFormats: any = (addFormatsImport as any).default ?? addFormatsImport;

// ✅ TS 5.5+ import attributes (replaces `assert { type: "json" }`)
import liteSchemaRaw from "./character-lite.schema.json" with { type: "json" };

// If the file wraps the actual JSON Schema under `schema`, use that; otherwise use the raw object.
const liteSchema: unknown = (liteSchemaRaw as any)?.schema ?? liteSchemaRaw;

// Ajv instance + formats (shared)
export const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ---------------- Types ----------------
export type CharacterLite = {
  client_ready: boolean;
  message?: string;
  identity: {
    char_name: string;
    char_slug: string;
    archetype?: string;
    vibe?: string;
  };
  personality: {
    desire: string;
    fear: string;
    flaw: string;
    traits: string[];
    quirk?: string;
    values?: string[];
  };
  physical: {
    species?: string;
    age_range: "child" | "teen" | "young_adult" | "adult" | "middle_aged" | "elder";
    gender?: "male" | "female" | "nonbinary" | "unspecified";
    height_category: "short" | "average" | "tall";
    build: "slim" | "average" | "muscular" | "heavy" | "lithe" | "stocky" | "other";
    skin_tone: string;
    hair_color: string;
    hair_style?: string;
    eye_color: string;
    distinctive_features?: string[];
    aesthetic_vibe?: string;
  };
};

export type AjvSummary = { message?: string; instancePath?: string; keyword?: string }[];

// ---------------- Character Lite ----------------
export const validateCharacterLite =
  ajv.compile(liteSchema as any) as ValidateFunction<CharacterLite>;

/**
 * Assistant payload validator (existing behavior):
 * - requires `message` to be a string
 * - validates the rest with the existing Character Lite schema
 */
export function validateAssistantChatPayload(
  input: unknown
):
  | { ok: true; message: string; draft: CharacterLite }
  | { ok: false; errors: AjvSummary } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: [{ message: "payload must be object", instancePath: "", keyword: "type" }] };
  }

  const obj: any = input;
  const msg = typeof obj.message === "string" ? obj.message : "";

  // Draft = object without "message"
  const draft = { ...obj };
  delete (draft as any).message;

  const valid = validateCharacterLite(draft);
  if (!valid) {
    const errs: AjvSummary =
      (validateCharacterLite.errors as (ErrorObject[] | null | undefined))?.map((e) => ({
        message: e.message,
        instancePath: e.instancePath,
        keyword: e.keyword,
      })) ?? [{ message: "unknown validation error", instancePath: "", keyword: "unknown" }];
    return { ok: false, errors: errs };
  }

  return { ok: true, message: msg, draft };
}

// ---------------- Char_Intermediary (new) ----------------
export type CharIntermediary = {
  body_type: "male" | "muscular" | "female" | "teen" | "child";
  head_type: string; // one filename from the assistant-enforced enum
  categories: Array<{
    category: string;
    preferred_colour: string; // free-form or hex; converter resolves later
    items: string[];          // ordered filenames from the reference list
  }>;
};

// Exactly the schema you gave the assistant; compiled with the same Ajv instance.
// Kept inline to avoid extra file plumbing; change to a JSON import later if desired.
const CHAR_INTERMEDIARY_SCHEMA: any = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "IntermediarySelection.v2.schema.json",
  name: "Char_Intermediary",
  description:
    "Mid-point between a character definition and an asset builder to create spritesheets for the character",
  schema: {
    name: "Char_Intermediary",
    type: "object",
    properties: {
      body_type: {
        type: "string",
        enum: ["male", "muscular", "female", "teen", "child"],
      },
      head_type: {
        type: "string",
        enum: [
          "heads_alien.json",
          "heads_boarman.json",
          "heads_boarman_child.json",
          "heads_frankenstein.json",
          "heads_goblin.json",
          "heads_goblin_child.json",
          "heads_human_child.json",
          "heads_human_elderly_small.json",
          "heads_human_female.json",
          "heads_human_female_elderly.json",
          "heads_human_female_small.json",
          "heads_human_male.json",
          "heads_human_male_elderly.json",
          "heads_human_male_gaunt.json",
          "heads_human_male_plump.json",
          "heads_human_male_small.json",
          "heads_jack.json",
          "heads_lizard_child.json",
          "heads_lizard_female.json",
          "heads_lizard_male.json",
          "heads_minotaur.json",
          "heads_minotaur_child.json",
          "heads_minotaur_female.json",
          "heads_mouse.json",
          "heads_mouse_child.json",
          "heads_orc_child.json",
          "heads_orc_female.json",
          "heads_orc_male.json",
          "heads_pig.json",
          "heads_pig_child.json",
          "heads_rabbit.json",
          "heads_rabbit_child.json",
          "heads_rat.json",
          "heads_rat_child.json",
          "heads_sheep.json",
          "heads_sheep_child.json",
          "heads_skeleton.json",
          "heads_troll.json",
          "heads_troll_child.json",
          "heads_vampire.json",
          "heads_wartotaur.json",
          "heads_wolf_child.json",
          "heads_wolf_female.json",
          "heads_wolf_male.json",
          "heads_zombie.json",
        ],
      },
      categories: {
        type: "array",
        description:
          "Ordered list of category selections. Each entry picks a category from the reference list and provides a preferred colour and ordered items from that category.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: {
              type: "string",
              description:
                "Category name chosen from the reference list (e.g., accessory, ammo, apron).",
            },
            preferred_colour: {
              type: "string",
              description:
                "Preferred colour for items in this category (free-form or hex like #RRGGBB).",
              anyOf: [
                { type: "string", pattern: "^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$" },
                { type: "string", minLength: 1 },
              ],
            },
            items: {
              type: "array",
              description:
                "Ordered file-name preferences chosen from the reference list for this category.",
              items: { type: "string" },
              minItems: 1,
              uniqueItems: true,
            },
          },
          required: ["category", "preferred_colour", "items"],
        },
      },
    },
    required: ["body_type", "head_type", "categories"],
    additionalProperties: false,
  },
};

const validateCharIntermediaryRaw =
  ajv.compile(CHAR_INTERMEDIARY_SCHEMA.schema) as ValidateFunction<CharIntermediary>;

export function validateCharIntermediaryPayload(
  input: unknown
):
  | { ok: true; data: CharIntermediary }
  | { ok: false; errors: AjvSummary } {
  const ok = validateCharIntermediaryRaw(input);
  if (ok) return { ok: true, data: input as CharIntermediary };

  const errs: AjvSummary =
    (validateCharIntermediaryRaw.errors as (ErrorObject[] | null | undefined))?.map((e) => ({
      message: e.message,
      instancePath: e.instancePath,
      keyword: e.keyword,
    })) ?? [{ message: "unknown validation error", instancePath: "", keyword: "unknown" }];

  return { ok: false, errors: errs };
}

// ---------------- Exports ----------------
export default {
  validateCharacterLite,
  validateAssistantChatPayload,
  validateCharIntermediaryPayload,
};

export * as ulpc from "./ulpc/index.js";
