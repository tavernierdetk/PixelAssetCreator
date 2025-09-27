import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { createLogger } from "@pixelart/log";
export { PATTERNS, listPatterns, hasPattern, type TilesetPatternId } from "./patterns/registry.js";


const log = createLogger("@tileset-compose");



export async function generateBlob47Tileset(params: {
dictPath: string;
options: { outDir: string; paletteName?: string; size?: "1024x1024"|"1024x1536"|"1536x1024"|"auto"; transparentBG?: boolean; quantize?: boolean; tileSize?: number; }
}): Promise<{ sheetPath: string }> {
const { outDir } = params.options;
await fs.mkdir(outDir, { recursive: true });
const sheetPath = path.join(outDir, "blob47_32.png");


// TEMP: transparent 8×6 grid @ 32px → 256×192 canvas as a placeholder
const w = 8 * 32, h = 6 * 32;
await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
.png().toFile(sheetPath);


log.info({ sheetPath }, "blob47 placeholder written");
return { sheetPath };
}


export async function generateBlob47MaskFirst(params: {
options: { outDir: string; baseTexturePrompt: string; maskDictPath: string; paletteName?: string; size?: "1024x1024"|"1024x1536"|"1536x1024"|"auto" }
}): Promise<{ sheetPath: string }> {
const { outDir } = params.options;
await fs.mkdir(outDir, { recursive: true });
const sheetPath = path.join(outDir, "maskfirst_blob47_32.png");


// TEMP placeholder
const w = 8 * 32, h = 6 * 32;
await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
.png().toFile(sheetPath);


log.info({ sheetPath }, "mask-first placeholder written");
return { sheetPath };
}