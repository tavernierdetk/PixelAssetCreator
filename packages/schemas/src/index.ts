import Ajv from "ajv";
import addFormats from "ajv-formats";

// JSON is loaded via CJS require in this pkg (CJS output)
const raw = require("./character-lite.schema.json");

// If the file wraps the actual JSON Schema under `schema`, use that; otherwise use the raw object.
const liteSchema = (raw && raw.schema) ? raw.schema : raw;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Compile the *actual* JSON Schema
export const validateCharacterLite = ajv.compile(liteSchema);

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
