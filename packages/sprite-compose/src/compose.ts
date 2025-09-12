import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

export type LayerPick = {
  category: string;
  variant: string;
  visible?: boolean;
  z_override?: number;
  offset?: { x?: number; y?: number };
};

export type BuildJson = {
  schema: "ulpc.build/1.0";
  generator: { project: "Universal-LPC-Spritesheet-Character-Generator"; version?: string };
  output?: { frame_size?: { w: number; h: number } };
  layers: LayerPick[];
};

export async function composeFullSheet(build: BuildJson, assetRoot: string, outFile: string) {
  const frameW = build.output?.frame_size?.w ?? 64;
  const frameH = build.output?.frame_size?.h ?? 64;

  const layers = build.layers.filter(L => L.visible !== false);
  if (!layers.length) throw new Error("No visible layers in build");

  const first = resolvePng(assetRoot, layers[0].variant);
  const meta = await sharp(first).metadata();
  if (!meta.width || !meta.height) throw new Error(`Bad base image: ${first}`);

  const overlays = [];
  for (const L of layers) {
    const fp = resolvePng(assetRoot, L.variant);
    const m = await sharp(fp).metadata();
    if (m.width !== meta.width || m.height !== meta.height) {
      throw new Error(`Layer size mismatch: ${fp}`);
    }
    overlays.push({ input: fp, left: L.offset?.x ?? 0, top: L.offset?.y ?? 0 });
  }

  const base = sharp({
    create: {
      width: meta.width!,
      height: meta.height!,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  const buf = await base.composite(overlays).png().toBuffer();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);

  const cols = Math.floor(meta.width! / frameW);
  const rows = Math.floor(meta.height! / frameH);
  return { width: meta.width!, height: meta.height!, cols, rows, frameW, frameH, outFile };
}

export async function extractTile(sheetPath: string, frameW: number, frameH: number, col: number, row: number, outFile: string) {
  await sharp(sheetPath)
    .extract({ left: col * frameW, top: row * frameH, width: frameW, height: frameH })
    .png()
    .toFile(outFile);
  return outFile;
}

export async function composeAndPreview(build: BuildJson, assetRoot: string, outDir: string, name = "sheet") {
  const sheetPath = path.join(outDir, `${name}.png`);
  const facts = await composeFullSheet(build, assetRoot, sheetPath);
  const preview = path.join(outDir, `${name}.idle.png`);
  await extractTile(sheetPath, facts.frameW, facts.frameH, 0, 0, preview);
  return { sheet: sheetPath, preview };
}

function resolvePng(root: string, variant: string) {
  const guess = path.join(root, variant + ".png");
  if (fs.existsSync(guess)) return guess;
  throw new Error(`PNG not found for variant: ${variant}`);
}
