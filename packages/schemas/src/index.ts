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

// Ajv instance + formats
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

// Compile the schema
// (No type arg on an untyped function; cast the result to ValidateFunction<CharacterLite>)
export const validateCharacterLite =
  ajv.compile(liteSchema as any) as ValidateFunction<CharacterLite>;

/**
 * Assistant payload validator:
 * - requires `message` to be a string
 * - validates the rest with the existing Character Lite schema
 */
export function validateAssistantChatPayload(
  input: unknown
):
  | { ok: true; message: string; draft: CharacterLite }
  | { ok: false; errors: AjvSummary }
{
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
      (validateCharacterLite.errors as (ErrorObject[] | null | undefined))?.map(e => ({
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
export * as ulpc from "./ulpc/index.js";
