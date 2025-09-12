import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ✅ Type the *default* export, not the module namespace
const Ajv: typeof import("ajv").default = require("ajv");
const addFormats: typeof import("ajv-formats").default = require("ajv-formats");

import type { ValidateFunction, ErrorObject } from "ajv";
import { ulpc } from "@pixelart/schemas";

const schema = ulpc.build as unknown;

const ajv = new Ajv({ allErrors: true, strict: false });
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
