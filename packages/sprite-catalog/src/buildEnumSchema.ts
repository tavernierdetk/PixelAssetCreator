// packages/sprite-catalog/src/buildEnumSchema.ts
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Build a JSON Schema whose enums are derived from the ULPC sheet_definitions.
 *
 * Env:
 *  ULPC_SHEET_DEFS  → absolute path to .../sheet_definitions (wins if set)
 *  ULPC_SCHEMA_OUT  → absolute path to output schema JSON (optional)
 */

const ROOT = process.cwd();

/** 1) Resolve sheet_definitions directory (env wins; else common fallbacks) */
const CANDIDATES: string[] = [
  process.env.ULPC_SHEET_DEFS || "",
  path.join(ROOT, "assets", "ulpc", "sheet_definitions"),
  path.join(ROOT, "assets", "sheet_definitions"),
  path.join(
    ROOT,
    "..",
    "Universal-LPC-Spritesheet-Character-Generator",
    "sheet_definitions"
  ),
].filter(Boolean);

const found = CANDIDATES.find((p) => fs.existsSync(p));
if (!found) {
  console.error(
    `[sprite-catalog] sheet_definitions not found.\nTried:\n${CANDIDATES
      .map((p) => ` - ${p}`)
      .join(
        "\n"
      )}\nSet ULPC_SHEET_DEFS=/absolute/path/to/Universal-LPC-Spritesheet-Character-Generator/sheet_definitions`
  );
  process.exit(1);
}
const SHEETDEFS_DIR: string = found; // narrowed non-optional

/** 2) Output path (defaults to @pixel/schemas src so it’s bundled there) */
const SCHEMA_OUT: string =
  process.env.ULPC_SCHEMA_OUT ??
  path.join(
    ROOT,
    "packages",
    "schemas",
    "src",
    "ulpc",
    "ulpc.build.schema.enum.json"
  );

/** Schema skeleton (only parts we mutate are typed explicitly for safety) */
type VariantSwitch = {
  if: { properties: { category: { const: string } } };
  then: { properties: { variant: { type: "string"; enum: string[] } } };
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
        enum: [
          "spellcast",
          "thrust",
          "walk",
          "slash",
          "shoot",
          "hurt",
          "bow",
          "climb",
          "run",
          "jump",
        ],
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
                  rgb: {
                    type: "string",
                    pattern: "^#([0-9A-Fa-f]{6})$",
                  },
                  mode: {
                    type: "string",
                    enum: ["multiply", "overlay", "screen", "replace"],
                  },
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
          urls: {
            type: "array",
            items: { type: "string", format: "uri" },
            minItems: 1,
          },
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

/** Helpers (sync, simple, fast for build scripts) */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && p.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

function readJson(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function categoryIdFromPath(file: string): string {
  return path
    .relative(SHEETDEFS_DIR, file)
    .replace(/\\/g, "/")
    .replace(/\.json$/i, "")
    .replace(/\/index$/i, "");
}

function coerceVariants(def: any): string[] {
  const src = def?.variants;
  if (!Array.isArray(src)) return [];
  const out: string[] = [];
  for (const item of src) {
    if (typeof item === "string") {
      if (item) out.push(item);
    } else if (item && typeof item === "object") {
      const cand =
        item.id ?? item.name ?? item.file ?? item.path ?? item.spritesheet;
      if (typeof cand === "string" && cand) out.push(cand);
    }
  }
  // dedupe + sort
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
}

/** 3) Gather categories + variant switches */
const files = walk(SHEETDEFS_DIR);

const categories: string[] = [];
const switches: VariantSwitch[] = [];

for (const f of files) {
  const def = readJson(f) as any;
  if (!def) continue;

  const id =
    typeof def.id === "string" && def.id.trim()
      ? String(def.id)
      : categoryIdFromPath(f);

  const variants = coerceVariants(def);
  if (variants.length === 0) continue;

  categories.push(id);
  switches.push({
    if: { properties: { category: { const: id } } },
    then: { properties: { variant: { type: "string", enum: variants } } },
  });
}

categories.sort((a, b) => a.localeCompare(b));
switches.sort((a, b) =>
  a.if.properties.category.const.localeCompare(
    b.if.properties.category.const
  )
);

schema.$defs.category_enum.enum = categories;
schema.$defs.variant_enum_switch.oneOf = switches;

/** 4) Write schema */
fs.mkdirSync(path.dirname(SCHEMA_OUT), { recursive: true });
fs.writeFileSync(SCHEMA_OUT, JSON.stringify(schema, null, 2), "utf-8");
console.log(
  `[sprite-catalog] wrote ${SCHEMA_OUT} with ${categories.length} categories`
);
