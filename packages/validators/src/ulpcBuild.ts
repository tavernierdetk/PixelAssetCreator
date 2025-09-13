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

/**
 * Cross-field rule: if both head and body layers are present,
 * enforce head.variant === body.variant (exact string match).
 * Throws with a clear, actionable message if they differ.
 */
export function assertHeadBodyVariantEqual(build: any): void {
  if (!build || !Array.isArray(build.layers)) return;

  const body = build.layers.find(
    (l: any) => typeof l?.category === "string" && l.category.startsWith("body/bodies/")
  );
  const head = build.layers.find(
    (l: any) => typeof l?.category === "string" && l.category.startsWith("head/heads/")
  );

  if (!body || !head) return; // If one is missing, other rules can handle requiredness.

  const b = body.variant ?? "";
  const h = head.variant ?? "";

  if (b !== h) {
    throw new Error(
      `Head/body variant mismatch: head="${h}" must equal body="${b}". ` +
      `The body’s confirmed colour is the single source of truth.`
    );
  }
}

export function makeUlpcBuildValidator<T>(): ValidateFn<T> {
  return (data: T) => {
    // 1) Schema validation
    const ok = validate(data as unknown);
    if (!ok) {
      const errs = (validate.errors ?? []) as ErrorObject[];
      const msg = errs.map((e) => `${e.instancePath} ${e.message}`).join("; ");
      throw new Error(`Invalid ULPC build JSON: ${msg}`);
    }

    // 2) Cross-field rule: head variant must match body variant
    assertHeadBodyVariantEqual(data);
  };
}
