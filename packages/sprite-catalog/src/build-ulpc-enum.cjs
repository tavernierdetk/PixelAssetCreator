/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

/* ─ paths (no envs) ─ */
const THIS_DIR = __dirname;                           // …/packages/sprite-catalog/scripts
const PKG_ROOT = path.resolve(THIS_DIR, "..");        // …/packages/sprite-catalog
const MONO_ROOT = path.resolve(PKG_ROOT, "..", ".."); // …/<repo-root>

function firstExistingDir(cands) {
  for (const d of cands) {
    try { if (fs.statSync(d).isDirectory()) return d; } catch {}
  }
  return null;
}

function getSpritesRoot() {
  const dir = firstExistingDir([
    path.join(PKG_ROOT, "vendor", "ulpc-src", "spritesheets"),
    path.join(PKG_ROOT, "vendor", "ulpc", "spritesheets"),
    path.join(MONO_ROOT, "packages", "schemas", "assets", "ulpc", "spritesheets"),
  ]);
  if (!dir) {
    throw new Error("Could not locate ULPC spritesheets (expected under packages/sprite-catalog/vendor/ulpc-src/spritesheets).");
  }
  return dir;
}
function getSheetDefsRoot() {
  return firstExistingDir([
    path.join(PKG_ROOT, "vendor", "ulpc-src", "sheet_definitions"),
    path.join(PKG_ROOT, "vendor", "ulpc", "sheet_definitions"),
  ]);
}

const SPRITES_ROOT = getSpritesRoot();
const SHEETDEFS_DIR = getSheetDefsRoot();

const SCHEMA_OUT = path.join(MONO_ROOT, "packages", "schemas", "src", "ulpc", "ulpc.build.schema.enum.json");

/* ─ helpers ─ */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function categoryIdFromDefs(file, baseDir) {
  return path
    .relative(baseDir, file)
    .replace(/\\/g, "/")
    .replace(/\.json$/i, "")
    .replace(/\/index$/i, "");
}
function variantId(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return v.id || v.name || v.file || v.path || null;
  return null;
}

/* ─ collect from spritesheets (authoritative) ─
   spritesheets/<category...>/<animation>/<variant>.png
   e.g. body/bodies/male/idle/bronze.png
*/
function collectFromSpritesheets(root) {
  const byCategory = new Map();
  const animations = new Set();

  function add(cat, variant) {
    let s = byCategory.get(cat);
    if (!s) byCategory.set(cat, (s = new Set()));
    s.add(variant);
  }

  const files = walk(root).filter((f) => f.toLowerCase().endsWith(".png"));
  for (const full of files) {
    const rel = path.relative(root, full).replace(/\\/g, "/").replace(/\.png$/i, "");
    const parts = rel.split("/"); // [...category..., anim, variant]
    if (parts.length < 3) continue;

    const variant = parts[parts.length - 1];
    const anim = parts[parts.length - 2];
    const category = parts.slice(0, parts.length - 2).join("/");

    if (!category || !variant || !anim) continue;
    animations.add(anim);
    add(category, variant);
  }

  return { byCategory, animations };
}

/* ─ optional enrich from sheet_definitions ─ */
function enrichFromSheetDefinitions(byCategory, defsDir) {
  const files = walk(defsDir).filter((f) => f.toLowerCase().endsWith(".json"));
  for (const f of files) {
    const def = readJson(f);
    if (!def) continue;

    const catId = categoryIdFromDefs(f, defsDir); // e.g. hair/afro/adult
    if (!byCategory.has(catId)) continue;

    const arr = Array.isArray(def.variants) ? def.variants : null;
    if (!arr || arr.length === 0) continue;

    const set = byCategory.get(catId);
    for (const v of arr) {
      const id = variantId(v);
      if (id) set.add(String(id));
    }
  }
}

/* ─ schema builder ─ */
function makeSchema(byCategory, animations) {
  const allCategories = Array.from(byCategory.keys()).sort();
  const animList = Array.from(animations).sort();

  return {
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
          project: { type: "string", enum: ["Universal-LPC-Spritesheet-Character-Generator"] },
          version: { type: "string" },
        },
        additionalProperties: false,
      },
      meta: {
        type: "object",
        properties: { name: { type: "string" }, seed: { type: "string" }, notes: { type: "string" } },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["full", "split_by_animation", "split_by_item", "split_both"] },
          frame_size: {
            type: "object",
            properties: { w: { type: "integer", minimum: 1 }, h: { type: "integer", minimum: 1 } },
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
        items: { type: "string", enum: animList },
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
              properties: { x: { type: "integer" }, y: { type: "integer" } },
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
      category_enum: { type: "string", enum: allCategories },
      variant_enum_switch: {
        allOf: allCategories.map((cat) => ({
          if:   { properties: { category: { const: cat } } },
          then: { properties: { variant: { type: "string", enum: Array.from(byCategory.get(cat)).sort() } } },
        })),
      },
    },
  };
}

/* ─ main ─ */
(function main() {
  console.log("[ulpc-enum] sprites root:", SPRITES_ROOT);
  if (SHEETDEFS_DIR) console.log("[ulpc-enum] sheet_definitions:", SHEETDEFS_DIR);

  const { byCategory, animations } = collectFromSpritesheets(SPRITES_ROOT);
  if (SHEETDEFS_DIR) enrichFromSheetDefinitions(byCategory, SHEETDEFS_DIR);

  const schema = makeSchema(byCategory, animations);

  fs.mkdirSync(path.dirname(SCHEMA_OUT), { recursive: true });
  fs.writeFileSync(SCHEMA_OUT, JSON.stringify(schema, null, 2), "utf8");

  console.log("[ulpc-enum] wrote:", SCHEMA_OUT);
  console.log("[ulpc-enum] categories:", schema.$defs.category_enum.enum.length);
  console.log("[ulpc-enum] switches  :", schema.$defs.variant_enum_switch.allOf.length);
  console.log("[ulpc-enum] sample cats:", schema.$defs.category_enum.enum.slice(0, 10));
})();
