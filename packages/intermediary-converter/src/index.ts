import { createLogger } from "@pixelart/log";
import { resolveUlpcSheetDefs } from "@pixelart/config";
import { makeUlpcBuildValidator } from "@pixelart/validators";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// TODO: replace with shared export from @pixelart/schemas once available
export type CharIntermediary = {
  body_type: "male" | "muscular" | "female" | "teen" | "child";
  head_type: string; // one of heads_*.json (assistant-enforced)
  categories: Array<{
    category: string;
    preferred_colour: string;
    items: string[];
  }>;
};

// Local color dictionary
import COLOR_DICT_RAW from "./color_dictionary.v1.json" with { type: "json" };

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
export type CategoryReference = Array<{
  category: string;
  items: string[];
  required?: boolean;
}>;

export type TraceEntry = {
  category: string;
  preferred_colour?: string;
  chosenItem: string | null;
  resolvedPath: string | null;
  chosenVariant: string | null;
  notes: string[];
};

export type ConvertOk = {
  ok: true;
  build: UlpcBuildJson;
  trace: TraceEntry[];
};

export type ConvertErr = {
  ok: false;
  errors: Array<{ category?: string; item?: string; reason: string; detail?: any }>;
  trace?: TraceEntry[];
};

export type ConvertResult = ConvertOk | ConvertErr;

export type UlpcBuildJson = {
  schema: "ulpc.build/1.0";
  generator: { project: "Universal-LPC-Spritesheet-Character-Generator"; version: string };
  animations: string[];
  layers: Array<{
    category: string;           // path-like enum
    variant: string;            // allowed by variant switch
    visible?: boolean;
    z_override?: number;
    offset?: { x?: number; y?: number };
    color?: { tint?: { rgb?: string; mode?: string } };
  }>;
};

type SheetDef = {
  name?: string;
  type_name?: string;
  layer_1?: Record<string, string>;
  variants?: string[];
  animations?: string[];
  credits?: unknown;
};

type ConvertOptions = {
  animations?: string[];           // default ["idle"]
  categoryReference: CategoryReference;
  loggerName?: string;             // default "intermediary-converter"
};

// Normalize for matching
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const COLOR_DICT: Record<string, string[]> = COLOR_DICT_RAW as any;

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Head/Body variant enforcement helper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Single source of truth: body variant.
 * After body is chosen, force head.variant === body.variant.
 * Mutates `build.layers` in-place and annotates the head trace entry if changed.
 */
function enforceHeadVariantEqualsBody(
  build: UlpcBuildJson,
  trace: TraceEntry[]
): void {
  if (!build?.layers?.length) return;

  const bodyIdx = build.layers.findIndex(
    (l) => typeof l.category === "string" && l.category.startsWith("body/bodies/")
  );
  const headIdx = build.layers.findIndex(
    (l) => typeof l.category === "string" && l.category.startsWith("head/heads/")
  );

  if (bodyIdx === -1 || headIdx === -1) return;

  const body = build.layers[bodyIdx];
  const head = build.layers[headIdx];
  if (!body?.variant) return;

  if (head.variant !== body.variant) {
    const from = head.variant ?? null;
    head.variant = body.variant;

    // annotate the most recent head trace entry (if any)
    const headTrace = [...trace]
      .reverse()
      .find((t) => t.category === "head" && t.chosenItem != null);
    if (headTrace) {
      headTrace.notes.push(
        `head_variant_overridden_to_body:from=${from ?? "null"}:to=${body.variant}`
      );
    }
  }
}


export async function convertCharIntermediaryToUlpc(
  ci: CharIntermediary,
  opts: ConvertOptions
): Promise<ConvertResult> {
  const log = createLogger(opts.loggerName ?? "intermediary-converter");
  const trace: TraceEntry[] = [];
  const errors: ConvertErr["errors"] = [];

  // Resolve defs directory
  let defsDir: string;
  try {
    defsDir = resolveUlpcSheetDefs();
    log.debug?.(`defsDir=${defsDir}`);
  } catch (e: any) {
    return {
      ok: false,
      errors: [{ reason: "ulpc_defs_not_found", detail: e?.message }],
    };
  }

  const bodyType = ci.body_type; // "male" | "muscular" | "female" | "teen" | "child"

  const build: UlpcBuildJson = {
    schema: "ulpc.build/1.0",
    generator: {
      project: "Universal-LPC-Spritesheet-Character-Generator",
      version: "internal"
    },
    animations: Array.isArray(opts.animations) && opts.animations.length ? opts.animations : ["idle"],
    layers: [],
  };

  // Helper: load a sheet definition by filename
  async function loadDef(fileName: string): Promise<SheetDef | null> {
    try {
      const buf = await readFile(join(defsDir, fileName), "utf8");
      return JSON.parse(buf) as SheetDef;
    } catch {
      return null;
    }
  }

  // Helper: resolve category path for this bodyType (fallback child→teen only)
  function resolveCategoryPath(def: SheetDef): string | null {
    const l1 = def.layer_1 || {};
    const raw = l1[bodyType] ?? (bodyType === "child" ? l1["teen"] : undefined);
    if (!raw || typeof raw !== "string") return null;
    return raw.replace(/\/$/, ""); // strip trailing slash
  }

  // Helper: choose variant from preferred colour and def.variants
  function chooseVariant(preferred: string | undefined, variants: string[] | undefined): { variant: string | null; note?: string } {
    if (!variants || variants.length === 0) return { variant: null, note: "no_variants_available" };
    if (!preferred || !preferred.trim()) return { variant: variants[0], note: "no_preferred_colour_fallback_first" };

    const prefNorm = norm(preferred);

    // 1) direct exact (case/space-insensitive)
    const direct = variants.find(v => norm(v) === prefNorm);
    if (direct) return { variant: direct, note: "direct_match" };

    // 2) dictionary mapping
    const dict = COLOR_DICT[prefNorm];
    if (dict && dict.length) {
      for (const candidate of dict) {
        const v = variants.find(x => norm(x) === norm(candidate));
        if (v) return { variant: v, note: "dict_match" };
      }
    }

    // 3) if given hex, we could map nearest later (phase 2). For now, fallback.
    return { variant: variants[0], note: "fallback_first_variant" };
  }

  // Emit a layer + trace for a chosen item
  async function resolveItem(category: string, itemFile: string, preferredColour?: string): Promise<TraceEntry> {
    const entry: TraceEntry = { category, preferred_colour: preferredColour, chosenItem: null, resolvedPath: null, chosenVariant: null, notes: [] };
    const def = await loadDef(itemFile);
    if (!def) {
      entry.notes.push(`missing_def:${itemFile}`);
      return entry;
    }

    const catPath = resolveCategoryPath(def);
    if (!catPath) {
      entry.notes.push(`no_layer_1_mapping_for:${ci.body_type}`);
      return entry;
    }

    const { variant, note } = chooseVariant(preferredColour, def.variants);
    if (note) entry.notes.push(note);
    if (!variant) {
      entry.notes.push("no_variant_resolved");
      return entry;
    }

    // Success
    entry.chosenItem = itemFile;
    entry.resolvedPath = catPath;
    entry.chosenVariant = variant;

    build.layers.push({ category: catPath, variant });
    return entry;
  }

  // 1) BODY (required)
  {
    // If the assistant provided a "body" category, use its ordered items; else default to ["body.json"].
    const bodyCatInput = ci.categories.find((c) => c.category === "body");

    const preferred = bodyCatInput?.preferred_colour ?? ci?.categories?.find(c => c.category === "body")?.preferred_colour;
    const items = bodyCatInput?.items?.length ? bodyCatInput.items : ["body.json"];

    let resolved: TraceEntry | null = null;
    for (const item of items) {
      const tr = await resolveItem("body", item, preferred);
      trace.push(tr);
      if (tr.chosenItem) { resolved = tr; break; }
    }
    if (!resolved) {
      return { ok: false, errors: [{ category: "body", reason: "required_category_unresolved" }], trace };
    }
  }

  // 2) HEAD (required, guided by head_type)
  {
    const headItem = ci.head_type;
    const tr = await resolveItem("head", headItem, undefined);
    trace.push(tr);
    if (!tr.chosenItem) {
      return { ok: false, errors: [{ category: "head", item: headItem, reason: "required_category_unresolved" }], trace };
    }
  }

  // 3) OTHER CATEGORIES (in the exact order from Char_Intermediary)
  {
    // Build a quick lookup from the reference list
    const refMap = new Map<string, string[]>();
    for (const r of opts.categoryReference) {
      refMap.set(r.category, r.items || []);
    }

    for (const sel of ci.categories) {
      const cat = sel.category;
      if (cat === "body") continue; // already handled
      // Head is driven by head_type; if the assistant also listed any head-like category, we skip to avoid conflicts.
      if (cat === "head" || cat.startsWith("heads_")) continue;

      const items = refMap.get(cat);
      if (!items || !items.length) {
        trace.push({ category: cat, preferred_colour: sel.preferred_colour, chosenItem: null, resolvedPath: null, chosenVariant: null, notes: ["unknown_category_in_reference"] });
        continue; // skip unknown category with a warning trace
      }

      // Try assistant-provided order, intersected with reference items to be safe
      const ordered = sel.items?.length ? sel.items.filter(f => items.includes(f)) : items;

      let resolved: TraceEntry | null = null;
      for (const file of ordered) {
        const tr = await resolveItem(cat, file, sel.preferred_colour);
        trace.push(tr);
        if (tr.chosenItem) { resolved = tr; break; }
      }
      if (!resolved) {
        // not fatal for optional categories
        trace.push({ category: cat, preferred_colour: sel.preferred_colour, chosenItem: null, resolvedPath: null, chosenVariant: null, notes: ["no_compatible_item_found"] });
      }
    }
  }
  enforceHeadVariantEqualsBody(build, trace);

  // 4) Final validation (programmatic, no local Ajv)
  try {
    const validate = makeUlpcBuildValidator<any>();
    validate(build); // throws on invalid
  } catch (e: any) {
    errors.push({ reason: "ulpc_build_validation_failed", detail: e?.message });
    return { ok: false, errors, trace };
  }

  return { ok: true, build, trace };
}

// Convenience: load Category Reference JSON from disk (absolute or project-relative)
export async function loadCategoryReferenceFromDisk(pathLike: string): Promise<CategoryReference> {
  const json = await readFile(pathLike, "utf8");
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error("category_reference_not_array");
  // quick sanity check
  for (const e of arr) {
    if (typeof e?.category !== "string" || !Array.isArray(e?.items)) {
      throw new Error("category_reference_invalid_shape");
    }
  }
  return arr as CategoryReference;
}
