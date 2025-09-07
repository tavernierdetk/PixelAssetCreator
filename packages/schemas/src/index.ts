import addFormats from "ajv-formats";
import Ajv, { type ErrorObject } from "ajv";

// JSON is loaded via CJS require in this pkg (CJS output)
const raw = require("./character-lite.schema.json");

// If the file wraps the actual JSON Schema under `schema`, use that; otherwise use the raw object.
const liteSchema = (raw && raw.schema) ? raw.schema : raw;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Compile the *actual* JSON Schema
export const validateCharacterLite = ajv.compile<CharacterLite>(liteSchema);

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
    age_range: "child"|"teen"|"young_adult"|"adult"|"middle_aged"|"elder";
    gender?: "male"|"female"|"nonbinary"|"unspecified";
    height_category: "short"|"average"|"tall";
    build: "slim"|"average"|"muscular"|"heavy"|"lithe"|"stocky"|"other";
    skin_tone: string;
    hair_color: string;
    hair_style?: string;
    eye_color: string;
    distinctive_features?: string[];
    aesthetic_vibe?: string;
  };
};

export type AjvSummary = { message?: string; instancePath?: string; keyword?: string }[];

/**
 * Assistant payload validator:
 * - requires `message` to be a string
 * - validates the rest with the existing Character Lite schema
 * This avoids schema duplication and keeps your codebase lean.
 */
export function validateAssistantChatPayload(input: unknown):
  | { ok: true; message: string; draft: CharacterLite }
  | { ok: false; errors: AjvSummary } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: [{ message: "payload must be object", instancePath: "", keyword: "type" }] };
  }

  const obj: any = input;
  const msg = typeof obj.message === "string" ? obj.message : "";

  // Draft = object without "message"
  const draft = { ...obj };
  delete draft.message;

  const valid = validateCharacterLite(draft);
  if (!valid) {
    const errs: AjvSummary =
      (validateCharacterLite.errors as ErrorObject[] | null | undefined)?.map(e => ({
        message: e.message,
        instancePath: e.instancePath,
        keyword: e.keyword,
      })) ?? [{ message: "unknown validation error", instancePath: "", keyword: "unknown" }];
    return { ok: false, errors: errs };
  }

  return { ok: true, message: msg, draft };
}

export default {
  validateCharacterLite,
  validateAssistantChatPayload,
};