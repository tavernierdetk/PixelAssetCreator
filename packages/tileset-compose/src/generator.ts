import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { createLogger } from "@pixelart/log";
import { generatePortraitOpenAI } from "@pixelart/adapters"; // generic image generate
import { loadPromptDictionary, loadMaskDictionary } from "./promptLoader.js";
import { quantizeToPalette } from "./quantize.js";
import { writeManifest, promptHash } from "./manifest.js";
import type {
  PromptDictionary, MaskDictionary, TilesetComposeOptions, TilesetComposeResult,
  TilesetManifest, RGB, MaskFirstOptions
} from "./types.js";
import { ROMAN_STEAMPUNK_32 } from "./palettes.js";

const log = createLogger("@tileset/generator");

function resolvePalette(opt: TilesetComposeOptions): RGB[] {
  return (opt.paletteRGB && opt.paletteRGB.length) ? opt.paletteRGB : ROMAN_STEAMPUNK_32;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function downscaleNearest(buf: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(buf).resize(w, h, { kernel: "nearest" }).png().toBuffer();
}

export async function generateBlob47Tileset(params: {
  dictPath: string;
  options: TilesetComposeOptions;
}): Promise<TilesetComposeResult> {
  const { dictPath, options } = params;
  const dict = await loadPromptDictionary(dictPath);
  const palette = resolvePalette(options);
  const outDir = options.outDir;
  const size = options.size ?? "1024x1024";
  const tile = options.tileSize ?? 32;
  const COLS = options.sheetCols ?? 8;
  const ROWS = options.sheetRows ?? 6;
  const transparentBG = options.transparentBG !== false;
  const quant = options.quantize !== false;

  await ensureDir(outDir);
  const rawDir = path.join(outDir, "raw");
  const tilesDir = path.join(outDir, "tiles_32");
  await ensureDir(rawDir);
  await ensureDir(tilesDir);

  const global = dict.global_preamble.trim();

  // 1) generate 47 images (per-tile)
  const tileOut: string[] = [];
  for (const spec of dict.tiles.slice(0, 47)) {
    const prompt = `${global}\n${spec.prompt}\nCanvas must be exactly ${size}.`;
    const buf = await generatePortraitOpenAI({
      prompt,
      size,                                   // uses your adapters normalizeSize()
      background: transparentBG ? "transparent" : undefined
    });

    const rawPath = path.join(rawDir, `${spec.id}_${spec.name}.png`);
    await fs.writeFile(rawPath, buf);

    let processed = buf;
    if (quant) processed = await quantizeToPalette(processed, palette);
    processed = await downscaleNearest(processed, tile, tile);

    const tilePath = path.join(tilesDir, `${spec.id}_${spec.name}_32.png`);
    await fs.writeFile(tilePath, processed);
    tileOut.push(tilePath);
    log.info({ id: spec.id, name: spec.name, bytes: processed.length }, "tile.done");
  }

  // 2) stitch 8×6 sheet (slot 48 empty)
  const sheetW = COLS * tile, sheetH = ROWS * tile;
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < 47; i++) {
    const row = Math.floor(i / COLS), col = i % COLS;
    composites.push({
      input: tileOut[i],
      left: col * tile,
      top: row * tile
    });
  }
  const sheetPath = path.join(outDir, `${dict.material}_blob47_${tile}.png`);
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite(composites)
    .png()
    .toFile(sheetPath);

  // 3) manifest
  const tilesForManifest = dict.tiles.slice(0, 47).map((t, idx) => ({
    id: t.id,
    name: t.name,
    file: path.relative(outDir, tileOut[idx]).replaceAll("\\", "/"),
    promptHash: promptHash(`${global}\n${t.prompt}`)
  }));

  const manifest: TilesetManifest = {
    schema: "tileset.manifest/1.0",
    material: String(dict.material),
    engine_order: "blob47",
    grid: { cols: COLS, rows: ROWS, tile },
    palette: { name: options.paletteName, rgb: resolvePalette(options) },
    openai: { model: "gpt-image-1", size, transparent: transparentBG },
    tiles: tilesForManifest,
    sheet: { file: path.basename(sheetPath), layout: "row-major" }
  };

  const manifestPath = path.join(outDir, `${dict.material}_blob47_manifest.json`);
  await writeManifest(manifestPath, manifest);

  return { sheetPath, tilePaths: tileOut, manifestPath };
}

/**
 * Mask-first pipeline:
 * 1) Generate 1024×1024 seamless base texture once.
 * 2) Generate 47 binary masks (white=terrain, transparent=void) at 1024×1024 each.
 * 3) Composite: mask * baseTexture; draw 1px inside outline along mask edges (optional TODO).
 * 4) Quantize + downscale + stitch.
 */
export async function generateBlob47MaskFirst(params: {
  options: MaskFirstOptions;
}): Promise<TilesetComposeResult> {
  const { options } = params;
  const palette = resolvePalette(options);
  const outDir = options.outDir;
  const size = options.size ?? "1024x1024";
  const tile = options.tileSize ?? 32;
  const COLS = options.sheetCols ?? 8;
  const ROWS = options.sheetRows ?? 6;
  const transparentBG = true;

  await ensureDir(outDir);
  const rawDir = path.join(outDir, "raw");
  const tilesDir = path.join(outDir, "tiles_32");
  await ensureDir(rawDir);
  await ensureDir(tilesDir);

  // 1) base texture
  const baseBuf = await generatePortraitOpenAI({
    prompt: options.baseTexturePrompt,
    size,
    background: "transparent" // texture should be opaque pixels; transparency allowed but not required
  });
  const basePath = path.join(rawDir, `base_texture.png`);
  await fs.writeFile(basePath, baseBuf);

  // 2) masks
  const maskDict = await loadMaskDictionary(options.maskDictPath);
  const maskPngs: string[] = [];
  for (const spec of maskDict.tiles.slice(0, 47)) {
    const p = `${spec.prompt}\nBinary mask: fill grass area pure white (#FFFFFF), background fully transparent. No antialiasing; sharp pixel edges. Canvas ${size}.`;
    const buf = await generatePortraitOpenAI({
      prompt: p,
      size,
      background: "transparent"
    });
    const maskPath = path.join(rawDir, `mask_${spec.id}_${spec.name}.png`);
    await fs.writeFile(maskPath, buf);
    maskPngs.push(maskPath);
  }

  // 3) composite mask * base
  const tileOut: string[] = [];
  for (let i=0;i<47;i++) {
    const composed = await sharp(basePath)
      .composite([{ input: maskPngs[i], blend: "dest-in" }]) // keep only masked area
      .png()
      .toBuffer();

    // TODO (optional): add 1px inside outline along mask edge in code.
    const q = await quantizeToPalette(composed, palette);
    const small = await downscaleNearest(q, tile, tile);

    const tilePath = path.join(tilesDir, `${i+1}_${maskDict.tiles[i].name}_32.png`);
    await fs.writeFile(tilePath, small);
    tileOut.push(tilePath);
  }

  // 4) stitch + manifest (material unknown; leave generic)
  const sheetW = COLS * tile, sheetH = ROWS * tile;
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < 47; i++) {
    const row = Math.floor(i / COLS), col = i % COLS;
    composites.push({ input: tileOut[i], left: col*tile, top: row*tile });
  }
  const sheetPath = path.join(outDir, `maskfirst_blob47_${tile}.png`);
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite(composites).png().toFile(sheetPath);

  const manifestPath = path.join(outDir, `maskfirst_blob47_manifest.json`);
  await writeManifest(manifestPath, {
    schema: "tileset.manifest/1.0",
    material: "mask-first",
    engine_order: "blob47",
    grid: { cols: COLS, rows: ROWS, tile },
    palette: { name: options.paletteName, rgb: palette },
    openai: { model: "gpt-image-1", size, transparent: true },
    tiles: maskDict.tiles.slice(0, 47).map((t, idx) => ({
      id: t.id, name: t.name, file: path.relative(outDir, tileOut[idx]).replaceAll("\\","/"),
      promptHash: undefined
    })),
    sheet: { file: path.basename(sheetPath), layout: "row-major" }
  });

  return { sheetPath, tilePaths: tileOut, manifestPath };
}
