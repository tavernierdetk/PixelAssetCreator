// packages/schemas/src/index.ts
import AjvImport from "ajv";
import addFormatsImport from "ajv-formats";
// Normalize default/namespace interop so Ajv is constructable and addFormats is callable
const Ajv = AjvImport.default ?? AjvImport;
const addFormats = addFormatsImport.default ?? addFormatsImport;
// ✅ TS 5.5+ import attributes (replaces `assert { type: "json" }`)
import liteSchemaRaw from "./character-lite.schema.json" with { type: "json" };
// If the file wraps the actual JSON Schema under `schema`, use that; otherwise use the raw object.
const liteSchema = liteSchemaRaw?.schema ?? liteSchemaRaw;
// Ajv instance + formats
export const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
// Compile the schema
// (No type arg on an untyped function; cast the result to ValidateFunction<CharacterLite>)
export const validateCharacterLite = ajv.compile(liteSchema);
/**
 * Assistant payload validator:
 * - requires `message` to be a string
 * - validates the rest with the existing Character Lite schema
 */
export function validateAssistantChatPayload(input) {
    if (typeof input !== "object" || input === null) {
        return { ok: false, errors: [{ message: "payload must be object", instancePath: "", keyword: "type" }] };
    }
    const obj = input;
    const msg = typeof obj.message === "string" ? obj.message : "";
    // Draft = object without "message"
    const draft = { ...obj };
    delete draft.message;
    const valid = validateCharacterLite(draft);
    if (!valid) {
        const errs = validateCharacterLite.errors?.map(e => ({
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
