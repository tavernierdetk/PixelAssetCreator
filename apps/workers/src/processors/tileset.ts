import path from "node:path";
import fs from "node:fs/promises";
import { createLogger } from "@pixelart/log";
import { tilesetDir, ensureDir } from "@pixelart/config";
import { generateBlob47Tileset, generateBlob47MaskFirst, generateCoast16Tileset, generateCoast16Procedural, hasPattern } from "@pixelart/tileset-compose";


const log = createLogger("@workers/tileset");


export async function tilesetProcessor(data: {
slug: string;
pattern: "blob47" | "coast16";
material?: string; // legacy (blob47)
mode?: "direct" | "mask" | "procedural";
paletteName?: string;
// New AB materials + vehicles (coast16)
materialA?: string;
materialB?: string;
vehiclesA?: string[];
vehiclesB?: string[];
 proceduralSettings?: {
   tileSize?: number;
   bandWidth?: number;
   cornerStyle?: "stepped"|"quarter"|"square";
   transitionMode?: "texture";
   textureScale?: number;
 };
}) {
const { slug, pattern, material = "grass", mode = "direct", paletteName = "roman_steampunk" } = data as any;
if (!hasPattern(pattern)) throw new Error(`Unsupported pattern: ${pattern}`);
log.info({ slug, pattern, material, mode }, "tileset start");
// Append debug
try {
  await fs.appendFile(path.join(tilesetDir(slug), "debug.log"), `${new Date().toISOString()} worker_start pattern=${pattern} mode=${mode}\n`, "utf8");
} catch {}


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
try { await fs.appendFile(path.join(outDir, "debug.log"), `${new Date().toISOString()} worker_done sheet=${result.sheetPath}\n`, "utf8"); } catch {}
return result;
}


// Future patterns: add branches here.
if (pattern === "coast16") {
  if (mode === "procedural") {
    // Use meta + overrides for procedural textures/settings
    const metaPath = path.join(outDir, "meta.json");
    let meta: any = {};
    try { meta = JSON.parse(await fs.readFile(metaPath, "utf8")); } catch {}
    const pt = meta?.procedural_textures || {};
    const ps = { tileSize: 32, bandWidth: 4, cornerStyle: "stepped", transitionMode: "texture", textureScale: 1.0, lineStyle: (meta?.procedural_settings as any)?.lineStyle || (data as any)?.proceduralSettings?.lineStyle || "straight_line", ...(meta?.procedural_settings || {}), ...(data as any)?.proceduralSettings } as any;

    const texA = typeof pt?.materialA === "string" ? pt.materialA : null;
    const texB = typeof pt?.materialB === "string" ? pt.materialB : null;
    const texT = typeof pt?.transition === "string" ? pt.transition : null;

    // Log resolved paths and existence
    try {
      const rpA = texA ? path.resolve(outDir, texA) : null;
      const rpB = texB ? path.resolve(outDir, texB) : null;
      const rpT = texT ? path.resolve(outDir, texT) : null;
      const exA = rpA ? await fs.access(rpA).then(() => true).catch(() => false) : false;
      const exB = rpB ? await fs.access(rpB).then(() => true).catch(() => false) : false;
      const exT = rpT ? await fs.access(rpT).then(() => true).catch(() => false) : false;
      const line = `${new Date().toISOString()} worker_proc_paths A=${rpA || 'none'}:${exA} B=${rpB || 'none'}:${exB} T=${rpT || 'none'}:${exT} settings=${JSON.stringify(ps)}\n`;
      await fs.appendFile(path.join(outDir, "debug.log"), line, "utf8");
    } catch {}

    const result = await generateCoast16Procedural({
      outDir,
      textures: { A: texA, B: texB, T: texT },
      settings: ps,
    });
    try { await fs.appendFile(path.join(outDir, "debug.log"), `${new Date().toISOString()} worker_done_procedural sheet=${result.sheetPath}\n`, "utf8"); } catch {}
    log.info({ slug, sheet: result.sheetPath }, "tileset done");
    return result;
  }
  const dictPath = new URL("../../../../packages/tileset-compose/prompts/coast16_ab.json", import.meta.url).pathname;
  const result = await generateCoast16Tileset({
    dictPath,
    options: {
      outDir,
      paletteName,
      size: "1024x1024",
      transparentBG: true,
      quantize: true,
      tileSize: 32,
      sheetCols: 4,
      sheetRows: 4,
      materialsAB: {
        A: { name: (data as any).materialA || "Land", vehicles: (data as any).vehiclesA || ["foot", "wheels"] },
        B: { name: (data as any).materialB || "Water", vehicles: (data as any).vehiclesB || ["boat"] },
      },
    },
  });
  log.info({ slug, sheet: result.sheetPath }, "tileset done");
  try { await fs.appendFile(path.join(outDir, "debug.log"), `${new Date().toISOString()} worker_done sheet=${result.sheetPath}\n`, "utf8"); } catch {}
  return result;
}

throw new Error(`Pattern handler not implemented: ${pattern}`);
}
