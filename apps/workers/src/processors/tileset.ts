import path from "node:path";
import { createLogger } from "@pixelart/log";
import { tilesetDir, ensureDir } from "@pixelart/config";
import { generateBlob47Tileset, generateBlob47MaskFirst, hasPattern } from "@pixelart/tileset-compose";


const log = createLogger("@workers/tileset");


export async function tilesetProcessor(data: {
slug: string;
pattern: "blob47"; // extend as patterns grow
material?: string;
mode?: "direct" | "mask";
paletteName?: string;
}) {
const { slug, pattern, material = "grass", mode = "direct", paletteName = "roman_steampunk" } = data as any;
if (!hasPattern(pattern)) throw new Error(`Unsupported pattern: ${pattern}`);
log.info({ slug, pattern, material, mode }, "tileset start");


const outDir = tilesetDir(slug);
await ensureDir(outDir);


if (pattern === "blob47") {
const dictPath = new URL("../../../../packages/tileset-compose/prompts/blob47_grass.json", import.meta.url).pathname;
const maskDictPath = new URL("../../../../packages/tileset-compose/prompts/blob47_mask.json", import.meta.url).pathname;


const result = mode === "mask"
? await generateBlob47MaskFirst({
options: {
outDir,
baseTexturePrompt: "Seamless 1024×1024 pixel-art grass texture, roman steampunk palette, zero text, crisp clusters, game-ready.",
maskDictPath,
paletteName,
size: "1024x1024",
},
})
: await generateBlob47Tileset({
dictPath,
options: { outDir, paletteName, size: "1024x1024", transparentBG: true, quantize: true, tileSize: 32 },
});


log.info({ slug, sheet: result.sheetPath }, "tileset done");
return result;
}


// Future patterns: add branches here.
throw new Error(`Pattern handler not implemented: ${pattern}`);
}