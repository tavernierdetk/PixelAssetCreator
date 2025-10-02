// packages/config/src/storage.ts
import { promises as fs } from "node:fs";
import { resolve, join, dirname } from "node:path";

export const ASSET_ROOT: string =
  process.env.ASSET_ROOT ?? resolve(process.cwd(), "..", "..", "assets", "characters");

// API runs in apps/api, Workers in apps/workers → ../.. lands at repo root in both cases
export const charDir = (slug: string) => join(ASSET_ROOT, slug);

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

export async function writeLiteDef(slug: string, data: unknown): Promise<string> {
  const dir = charDir(slug);
  await ensureDir(dir);
  const file = join(dir, `char_def_lite_${slug}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

export async function readLiteDef(slug: string): Promise<any> {
  const file = join(charDir(slug), `char_def_lite_${slug}.json`);
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

export async function writeIntermediary(slug: string, data: unknown): Promise<string> {
  const dir = charDir(slug);
  await ensureDir(dir);
  const file = join(dir, "intermediary.json");
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

export async function readIntermediary(slug: string): Promise<any> {
  const file = join(charDir(slug), "intermediary.json");
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

export async function writeUlpcBuild(slug: string, data: unknown): Promise<string> {
  const dir = charDir(slug);
  await ensureDir(dir);
  const file = join(dir, "ulpc.json");
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

export async function readUlpcBuild(slug: string): Promise<any> {
  const file = join(charDir(slug), "ulpc.json");
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

// ───────────────────────── Project Settings ─────────────────────────
// Canonical path (preferred) and legacy fallback
export const SETTINGS_FILE: string =
  process.env.PROJECT_SETTINGS_FILE ??
  // Default to repo-root/assets/project/project_settings.json
  resolve(process.cwd(), "..", "..", "assets", "project", "project_settings.json");

const LEGACY_SETTINGS_FILE: string = resolve(
  process.cwd(),
  "..",
  "..",
  "assets",
  "project.settings.json",
);

function isObject(x: any): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function deepMerge<A extends Record<string, any>, B extends Record<string, any>>(base: A, override: B): A & B {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (isObject(v) && isObject((out as any)[k])) out[k] = deepMerge((out as any)[k], v);
    else out[k] = v;
  }
  return out;
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const txt = await fs.readFile(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function readProjectSettings(): Promise<Record<string, unknown>> {
  // Read canonical and legacy, merge if both present (legacy fills gaps)
  const [primary, legacy] = await Promise.all([readJson(SETTINGS_FILE), readJson(LEGACY_SETTINGS_FILE)]);
  if (primary && legacy) return deepMerge(legacy as any, primary as any);
  return (primary ?? legacy ?? {}) as Record<string, unknown>;
}

export async function writeProjectSettings(obj: Record<string, unknown>): Promise<string> {
  // Always persist to canonical path
  await ensureDir(dirname(SETTINGS_FILE));
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(obj, null, 2), "utf8");
  return SETTINGS_FILE;
}

// ───────────────────────── Tileset storage (mirrors character strategy) ─────────────────────────
import { sep } from "node:path";

export const TILESET_ROOT: string =
  process.env.TILESET_ROOT ??
  resolve(process.cwd(), "..", "..", "assets", "tilesets");

export const tilesetDir = (slug: string) => join(TILESET_ROOT, slug);

export async function writeTilesetManifest(slug: string, data: unknown): Promise<string> {
  const dir = tilesetDir(slug);
  await ensureDir(dir);
  const file = join(dir, `tileset_manifest_${slug}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

export async function listTilesetFiles(slug: string): Promise<string[]> {
  const root = tilesetDir(slug);
  const out: string[] = [];
  async function walk(dir: string, base = ""): Promise<void> {
    let entries: import("fs").Dirent[] = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      const abs = join(dir, e.name);
      if (e.isDirectory()) await walk(abs, rel);
      else if (e.isFile()) out.push(rel);
    }
  }
  await walk(root, "");
  return out;
}

// ───────────────────────── Scene assets storage ─────────────────────────
export const SCENE_ASSET_ROOT: string =
  process.env.SCENE_ASSET_ROOT ??
  resolve(process.cwd(), "..", "..", "assets", "scenes");

export function sceneAssetsDir(category?: string): string {
  return category ? join(SCENE_ASSET_ROOT, category) : SCENE_ASSET_ROOT;
}
