import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
export const ASSET_ROOT = process.env.ASSET_ROOT ?? resolve(process.cwd(), "..", "..", "assets", "characters");
// API runs in apps/api, Workers in apps/workers → ../.. lands at repo root in both cases
export const charDir = (slug) => join(ASSET_ROOT, slug);
export async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}
export async function writeLiteDef(slug, data) {
    const dir = charDir(slug);
    await ensureDir(dir);
    const file = join(dir, `char_def_lite_${slug}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
    return file;
}
export async function readLiteDef(slug) {
    const file = join(charDir(slug), `char_def_lite_${slug}.json`);
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text);
}
