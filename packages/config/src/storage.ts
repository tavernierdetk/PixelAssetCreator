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
export const SETTINGS_FILE: string =
  process.env.PROJECT_SETTINGS_FILE ??
  resolve(process.cwd(), "..", "..", "assets", "project.settings.json");

export async function readProjectSettings(): Promise<Record<string, unknown>> {
  try {
    const txt = await fs.readFile(SETTINGS_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

export async function writeProjectSettings(obj: Record<string, unknown>): Promise<string> {
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

