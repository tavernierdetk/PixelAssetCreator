import Fuse from "fuse.js";
import fs from "node:fs";
import path from "node:path";

export type AssetRecord = {
  category: string;
  variant: string;
  label: string;
  tags: string[];
};

export function buildAssetIndex(sheetDefRoot: string): Fuse<AssetRecord> {
  const files = walkJson(sheetDefRoot);
  const records: AssetRecord[] = [];

  for (const f of files) {
    const def = readJson(f);
    const category = def?.id ?? deriveIdFromPath(sheetDefRoot, f);
    const variants = normalizeVariants(def?.variants);
    for (const v of variants) {
      records.push({
        category,
        variant: v.id,
        label: v.label ?? v.id.replace(/[_/-]/g, " "),
        tags: (def?.tags ?? []).concat(v.tags ?? []).map((t: string) => t.toLowerCase())
      });
    }
  }

  return new Fuse(records, {
    includeScore: true,
    threshold: 0.35,
    keys: ["label", "tags", "category", "variant"]
  });
}

/* helpers */
function walkJson(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJson(p));
    else if (e.isFile() && p.endsWith(".json")) out.push(p);
  }
  return out;
}
function readJson(f: string) { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return null; } }
function deriveIdFromPath(root: string, f: string) {
  return path.relative(root, f).replace(/\\/g, "/").replace(/\.json$/i, "").replace(/\/index$/i, "");
}
function normalizeVariants(v: any): Array<{id: string, label?: string, tags?: string[]}> {
  if (!Array.isArray(v)) return [];
  return v.map((x: any) =>
    typeof x === "string" ? { id: x } :
    (x?.id ? { id: x.id, label: x.name ?? x.label, tags: x.tags } :
             { id: x.name ?? x.file ?? x.path ?? "unknown" })
  );
}
