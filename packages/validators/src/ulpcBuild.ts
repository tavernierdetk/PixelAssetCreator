// packages/validators/src/ulpcBuild.ts

import type { ValidateFunction, ErrorObject } from "ajv";
import addFormatsImport from "ajv-formats";
import { ulpc } from "@pixelart/schemas";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ✅ Load Ajv 2020 class at runtime (no TS typings needed for this path)
const Ajv2020: any = (require("ajv/dist/2020") as any).default ?? require("ajv/dist/2020");

// Normalize addFormats ESM/CJS interop so it’s callable
const addFormats: any = (addFormatsImport as any).default ?? addFormatsImport;

const schema = ulpc.build as unknown;

// Use Ajv 2020 so schemas with `$schema: 2020-12` compile without manual metaschema import
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema as any) as ValidateFunction<unknown>;

export type ValidateFn<T> = (data: T) => void;

export function makeUlpcBuildValidator<T>(): ValidateFn<T> {
  return (data: T) => {
    const ok = validate(data as unknown);
    if (!ok) {
      const errs = (validate.errors ?? []) as ErrorObject[];
      const msg = errs.map((e) => `${e.instancePath} ${e.message}`).join("; ");
      throw new Error(`Invalid ULPC build JSON: ${msg}`);
    }
  };
}
