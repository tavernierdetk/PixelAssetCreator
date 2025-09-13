// packages/sprite-compose/src/ulpc.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createLogger } from "@pixelart/log";
import { resolveUlpcSheetDefs, resolveUlpcRoot } from "@pixelart/config";

const log = createLogger("@compose/ulpc");

type LayerSpec = {
  category: string;
  variant: string;
  visible?: boolean;
  z_override?: number;
  offset?: { x?: number; y?: number };
  color?: { palette?: string; tint?: { rgb?: string; mode?: "multiply"|"overlay"|"screen"|"replace" } };
  credits_tag?: string;
};

type BuildSpec = {
  schema: "ulpc.build/1.0";
  generator?: { project?: string; version?: string };
  meta?: Record<string, unknown>;
  output?: {
    mode?: "full" | "split_by_animation" | "split_by_item" | "split_both";
    frame_size?: { w: number; h: number };
    padding?: number;
    trim?: boolean;
    background?: "transparent";
  };
  animations?: string[];
  layers: LayerSpec[];
};

function exists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function readJson<T = any>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")) as T; } catch { return null; }
}
// Increase default scan depth to catch deep categories like head/heads/human/male/idle/*.png
function walkPng(root: string, maxDepth = 7): string[] {
  const out: string[] = [];
  function go(dir: string, depth: number) {
    if (depth > maxDepth) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) go(p, depth + 1);
      else if (e.isFile() && /\.(png|webp)$/i.test(e.name)) out.push(p);
    }
  }
  if (exists(root)) go(root, 0);
  return out;
}

function toAbs(fromFile: string, relOrAbs: string): string {
  if (path.isAbsolute(relOrAbs)) return relOrAbs;
  const candidate = path.resolve(path.dirname(fromFile), relOrAbs);
  if (exists(candidate)) return candidate;
  const fromRoot = path.resolve(resolveUlpcRoot(), relOrAbs);
  return fromRoot;
}

function pngFromVariantJson(jsonPath: string, obj: any): string | null {
  const fields = [
    obj?.file,
    Array.isArray(obj?.files) ? obj.files[0] : undefined,
    obj?.png,
    obj?.path,
    obj?.image,
    obj?.images?.sheet,
  ].filter(Boolean) as string[];
  for (const rel of fields) {
    const abs = toAbs(jsonPath, rel);
    if (exists(abs) && /\.(png|webp)$/i.test(abs)) return abs;
  }
  return null;
}

function animationsFallback(): string[] {
  const env = process.env.ULPC_ANIMS_FALLBACK;
  if (env && env.trim()) {
    return env.split(",").map(s => s.trim()).filter(Boolean);
  }
  // sensible default coverage
  return ["idle","walk","run","slash","thrust","shoot","hurt","jump","sit","emote","climb","combat"];
}

async function resolveLayerPng(categoryIn: string, variantIn: string): Promise<string> {
  // Defensive normalization
  let category = categoryIn.replace(/\/+$/,"");
  const variant = variantIn;
  const lowerCat = category.toLowerCase();
  const lowerVar = variant.toLowerCase();
  if (lowerCat.endsWith(`/${lowerVar}`)) {
    // If caller accidentally appended the variant to category, strip it.
    category = category.slice(0, -(variant.length + 1));
  }

  const defsDir = resolveUlpcSheetDefs();
  const catDir = path.join(defsDir, category);
  const directJson = path.join(catDir, `${variant}.json`);
  const indexJson = path.join(catDir, "index.json");

  // 1) <category>/<variant>.json
  if (exists(directJson)) {
    const def = readJson(directJson);
    const png = def && pngFromVariantJson(directJson, def);
    if (png && exists(png)) return png;
  }

  // 2) <category>/index.json variants[]
  if (exists(indexJson)) {
    const idx = readJson<any>(indexJson);
    const vs = Array.isArray(idx?.variants) ? idx.variants : [];
    const hit = vs.find((v: any) =>
      v?.id === variant ||
      v?.name === variant ||
      v?.file === `${variant}.png` ||
      v?.file === variant
    );
    if (hit) {
      const png = pngFromVariantJson(indexJson, hit);
      if (png && exists(png)) return png;
      const ref = hit.json ?? hit.def ?? hit.variant;
      if (ref) {
        const refAbs = toAbs(indexJson, ref);
        if (exists(refAbs)) {
          const sub = readJson(refAbs);
          const p2 = pngFromVariantJson(refAbs, sub);
          if (p2 && exists(p2)) return p2;
        }
      }
    }
  }

  // 3a) Direct constructed paths under spritesheets root with common animations
  {
    const root = resolveUlpcRoot();
    const prefer = animationsFallback();
    for (const a of prefer) {
      // try .png then .webp
      const p1 = path.join(root, category, a, `${variant}.png`);
      if (exists(p1)) return p1;
      const p2 = path.join(root, category, a, `${variant}.webp`);
      if (exists(p2)) return p2;
    }
  }

  // 3b) Broad fallback scan – prefer scanning within the category subtree if present
  const root = resolveUlpcRoot();
  const catRoot = path.join(root, category);
  const scanRoot = exists(catRoot) ? catRoot : root;
  const pngs = walkPng(scanRoot, exists(catRoot) ? 7 : 7);
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();

  const needleCat = `/${category.toLowerCase()}/`;
  const vTok = variant.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const candidates = pngs
    .map(norm)
    .filter(p =>
      p.includes(needleCat) &&
      (
        p.endsWith(`/${lowerVar}.png`) ||
        p.endsWith(`/${lowerVar}.webp`) ||
        p.includes(`/${lowerVar}.`) ||
        p.includes(vTok)
      )
    );

  if (candidates.length) {
    // pick the shortest path (usually most specific)
    const best = candidates.sort((a, b) => a.length - b.length)[0];
    return best;
  }

  throw new Error(`Unable to resolve PNG for ${category}/${variant}`);
}

async function applyTintIfAny(img: sharp.Sharp, layer: LayerSpec): Promise<sharp.Sharp> {
  const hex = layer.color?.tint?.rgb;
  const mode = layer.color?.tint?.mode ?? "multiply";
  if (!hex || mode !== "multiply") return img;
  return img.tint(hex as any);
}

export async function composeULPC(
  build: BuildSpec,
  outPath: string
): Promise<{ outPath: string; bytes: number; layers: number; width: number; height: number; }> {
  if (build.schema !== "ulpc.build/1.0") {
    throw new Error(`Unsupported schema: ${build?.schema}`);
  }
  const visible = (build.layers ?? []).filter(l => l.visible !== false);
  if (!visible.length) throw new Error("No visible layers to compose");

  log.info({ msg: "compose.start", defsDir: resolveUlpcSheetDefs(), layers: visible.length });

  // Resolve all layer PNGs
  const resolved: Array<{ layer: LayerSpec; png: string }> = [];
  for (const l of visible) {
    const png = await resolveLayerPng(l.category, l.variant);
    resolved.push({ layer: l, png });
    log.info({ msg: "layer.resolved", category: l.category, variant: l.variant, png });
  }

  // Canvas size from first layer
  const baseMeta = await sharp(resolved[0].png).metadata();
  const W = baseMeta.width ?? 0;
  const H = baseMeta.height ?? 0;
  if (!W || !H) throw new Error("Cannot infer sheet size from first layer");

  // Order overlays
  const overlays: sharp.OverlayOptions[] = [];
  const sorted = resolved
    .map((r, i) => ({ ...r, z: r.layer.z_override ?? i, idx: i }))
    .sort((a, b) => (a.z - b.z) || (a.idx - b.idx));

  for (const r of sorted) {
    const left = r.layer.offset?.x ?? 0;
    const top  = r.layer.offset?.y ?? 0;
    let img = sharp(r.png).ensureAlpha();
    img = await applyTintIfAny(img, r.layer);
    overlays.push({ input: await img.toBuffer(), left, top });
  }

  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(overlays).png().toFile(outPath);

  const stat = await fsp.stat(outPath);
  const bytes = stat.size;

  log.info({ msg: "compose.done", outPath, bytes, width: W, height: H, layers: overlays.length });
  return { outPath, bytes, layers: overlays.length, width: W, height: H };
}
