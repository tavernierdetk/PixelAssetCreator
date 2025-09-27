import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { TilesetManifest, RGB } from "./types.js";

export function promptHash(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
}

export async function writeManifest(p: string, data: TilesetManifest): Promise<string> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
  return p;
}

export function toRGB(hex: string): RGB {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return [r,g,b];
}
