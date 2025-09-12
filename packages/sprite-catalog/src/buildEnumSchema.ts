import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveUlpcSheetDefs } from "@pixelart/config";

/** Resolve package & monorepo roots from this file (works from src or dist) */
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));       // .../packages/sprite-catalog/src OR /dist
// if running from dist, parent is dist; one up gives package root. if from src, one up gives package root too.
const PKG_ROOT = path.resolve(THIS_DIR, "..");                       // .../packages/sprite-catalog
const MONO_ROOT = path.resolve(PKG_ROOT, "..", "..");                // .../<repo-root>

/** 1) Resolve ULPC sheet_definitions (env wins; otherwise search relative to repo root) */
const SHEETDEFS_DIR: string = resolveUlpcSheetDefs({ cwd: MONO_ROOT });

/** 2) Output path (defaults into @pixelart/schemas src so it’s bundled there) */
const SCHEMA_OUT: string =
  process.env.ULPC_SCHEMA_OUT ??
  path.join(MONO_ROOT, "packages", "schemas", "src", "ulpc", "ulpc.build.schema.enum.json");

/** Schema skeleton */
type VariantSwitch = {
  if:   { properties: { category: { const: string } }; required?: ["category"] };
  then: { properties: { variant: { type: "string"; enum: string[] } } };
  else: false; // ⬅️ non-matching branches must fail
};
type EnumSchema = {
  $schema: string;
  $id: string;
  title: string;
  type: "object";
  required: string[];
  properties: Record<string, unknown>;
  additionalProperties: boolean;
  $defs: {
    category_enum: { type: "string"; enum: string[] };
    variant_enum_switch: { oneOf: VariantSwitch[] };
  };
};

const schema: EnumSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://pixelart-backbone/schema/ulpc.build.schema.enum.json",
  title: "ULPC Character Build (Enum-locked)",
  type: "object",
  required: ["schema", "generator", "layers"],
  properties: {
    schema: { type: "string", enum: ["ulpc.build/1.0"] },
    generator: {
      type: "object",
      required: ["project"],
      properties: {
        project: {
          type: "string",
          enum: ["Universal-LPC-Spritesheet-Character-Generator"],
        },
        version: { type: "string" },
      },
      additionalProperties: false,
    },
    meta: {
      type: "object",
      properties: {
        name: { type: "string" },
        seed: { type: "string" },
        notes: { type: "string" },
      },
      additionalProperties: false,
    },
    output: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["full", "split_by_animation", "split_by_item", "split_both"],
        },
        frame_size: {
          type: "object",
          properties: {
            w: { type: "integer", minimum: 1 },
            h: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        },
        padding: { type: "integer", minimum: 0 },
        trim: { type: "boolean" },
        background: { type: "string", enum: ["transparent"] },
      },
      additionalProperties: false,
    },
    animations: {
      type: "array",
      items: {
        type: "string",
        enum: ["spellcast", "thrust", "walk", "slash", "shoot", "hurt", "bow", "climb", "run", "jump", "idle", "sit", "emote", "combat"],
      },
      uniqueItems: true,
    },
    layers: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["category", "variant"],
        properties: {
          category: { $ref: "#/$defs/category_enum" },
          variant: { type: "string" },
          visible: { type: "boolean" },
          z_override: { type: "integer" },
          offset: {
            type: "object",
            properties: {
              x: { type: "integer" },
              y: { type: "integer" },
            },
            additionalProperties: false,
          },
          color: {
            type: "object",
            properties: {
              palette: { type: "string" },
              tint: {
                type: "object",
                properties: {
                  rgb: { type: "string", pattern: "^#([0-9A-Fa-f]{6})$" },
                  mode: { type: "string", enum: ["multiply", "overlay", "screen", "replace"] },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
          credits_tag: { type: "string" },
        },
        additionalProperties: false,
        allOf: [{ $ref: "#/$defs/variant_enum_switch" }],
      },
    },
    credits: {
      type: "array",
      items: {
        type: "object",
        required: ["file", "authors", "licenses", "urls"],
        properties: {
          file: { type: "string" },
          notes: { type: "string" },
          authors: { type: "array", items: { type: "string" }, minItems: 1 },
          licenses: { type: "array", items: { type: "string" }, minItems: 1 },
          urls: { type: "array", items: { type: "string", format: "uri" }, minItems: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
  $defs: {
    category_enum: { type: "string", enum: [] },
    variant_enum_switch: { oneOf: [] },
  },
};

/*──────── helpers ────────*/
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && p.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}
function readJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}
/** derive category id from *path*, e.g. hair/bedhead/adult */
function categoryIdFromPath(file: string): string {
  return path
    .relative(SHEETDEFS_DIR, file)
    .replace(/\\/g, "/")
    .replace(/\.json$/i, "")
    .replace(/\/index$/i, "");
}
/** normalize variant objects to a token id */
function variantId(v: any): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    return (v.id ?? v.name ?? v.file ?? v.path ?? null) as string | null;
  }
  return null;
}

/*──────── main build ────────*/
const files = walk(SHEETDEFS_DIR);

// Map category → Set<variant>
const byCategory = new Map<string, Set<string>>();

for (const f of files) {
  const def = readJson(f);
  if (!def) continue;

  // We only care about definitions that have "variants".
  const arr = Array.isArray(def.variants) ? def.variants : null;
  if (!arr) continue;

  const category = (def.id && typeof def.id === "string" ? def.id : categoryIdFromPath(f)) as string;
  // Normalize category to be path-like (if someone put a display name in id, fall back to path)
  const catLooksLikePath = category.includes("/") || category.includes("-");
  const catId = catLooksLikePath ? category : categoryIdFromPath(f);

  let set = byCategory.get(catId);
  if (!set) {
    set = new Set<string>();
    byCategory.set(catId, set);
  }

  for (const v of arr) {
    const id = variantId(v);
    if (!id) continue;
    set.add(String(id));
  }
}

/* fill schema */
const allCategories = Array.from(byCategory.keys()).sort();
schema.$defs.category_enum.enum = allCategories;

schema.$defs.variant_enum_switch.oneOf = allCategories.map<VariantSwitch>((cat) => {
  const variants: string[] = Array.from(byCategory.get(cat) ?? new Set<string>())
    .map((v) => String(v))
    .sort();

  return {
    if:   { properties: { category: { const: cat } }, required: ["category"] },
    then: { properties: { variant: { type: "string", enum: variants } } },
    else: false,
  };
});

/* write */
fs.mkdirSync(path.dirname(SCHEMA_OUT), { recursive: true });
fs.writeFileSync(SCHEMA_OUT, JSON.stringify(schema, null, 2), "utf-8");

console.log("[sprite-catalog] ULPC enum schema written:");
console.log(`  defs : ${SHEETDEFS_DIR}`);
console.log(`  out  : ${SCHEMA_OUT}`);
console.log(`  categories: ${allCategories.length}`);
console.log(`  switches  : ${schema.$defs.variant_enum_switch.oneOf.length}`);