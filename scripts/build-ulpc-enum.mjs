import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const targetFile = "packages/schemas/src/ulpc/ulpc.build.schema.enum.json";

// 1) Find spritesheets root
const candidates = [
  process.env.ULPC_SPRITES_ROOT,
  "packages/sprite-catalog/vendor/ulpc-src/spritesheets",
  "packages/sprite-catalog/vendor/ulpc/spritesheets",
  "packages/schemas/assets/ulpc/spritesheets",
].filter(Boolean);

let SPRITES = null;
for (const p of candidates) {
  const full = path.isAbsolute(p) ? p : path.join(repoRoot, p);
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    SPRITES = full;
    break;
  }
}
if (!SPRITES) {
  console.error("Could not locate ULPC spritesheets directory.");
  console.error("Tried:", candidates);
  process.exit(1);
}

// 2) Walk and collect categories -> variants
const byCategory = new Map();

(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(f);
    else if (ent.isFile() && f.endsWith(".png")) {
      const rel = path.relative(SPRITES, f).replace(/\\/g, "/");
      const parts = rel.split("/");
      if (parts.length < 3) return;

      const variantWithExt = parts[parts.length - 1];
      const variant = variantWithExt.replace(/\.png$/i, "");
      const animation = parts[parts.length - 2];
      const category = parts.slice(0, parts.length - 2).join("/");

      // If you want to limit to specific tops (e.g., body/hair/legs) uncomment:
      // if (!/^(body|hair|legs)\//.test(category)) return;

      // We don't use animation in the enum; variants are union across animations.
      const set = byCategory.get(category) || new Set();
      set.add(variant);
      byCategory.set(category, set);
    }
  }
})(SPRITES);

// 3) Build enums
const categories = Array.from(byCategory.keys()).sort((a, b) => a.localeCompare(b));
const oneOf = categories.map((cat) => {
  const variants = Array.from(byCategory.get(cat)).sort((a, b) => a.localeCompare(b));
  return {
    if: {
      type: "object",
      required: ["category"],
      properties: { category: { const: cat } },
    },
    then: {
      type: "object",
      required: ["variant"],
      properties: { variant: { enum: variants } },
    },
  };
});

// 4) Patch the existing schema file ($defs only)
let schema;
if (fs.existsSync(targetFile)) {
  schema = JSON.parse(fs.readFileSync(targetFile, "utf8"));
} else {
  schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://pixelart-backbone/schema/ulpc.build.schema.enum.json",
  };
}
schema.$defs = schema.$defs || {};
schema.$defs.category_enum = { enum: categories };
schema.$defs.variant_enum_switch = { oneOf };

fs.writeFileSync(targetFile, JSON.stringify(schema, null, 2) + "\n", "utf8");

console.log("Sprites root:", SPRITES);
console.log("Wrote:", targetFile);
console.log("Categories:", categories.length);
console.log("Example:", categories.slice(0, 5));
