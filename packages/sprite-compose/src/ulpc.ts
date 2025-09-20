// packages/sprite-compose/src/ulpc.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createLogger } from "@pixelart/log";
import { resolveUlpcSheetDefs, resolveUlpcRoot } from "@pixelart/config";
import { sliceSheetByGrid, type GridInfo } from "./slicer.js";

const log = createLogger("@compose/ulpc");

type LayerSpec = {
  category: string;
  variant: string;
  visible?: boolean;
  z_override?: number;
  offset?: { x: number; y: number };
  color?: { palette?: string; tint?: { rgb?: string; mode?: "multiply"|"overlay"|"screen"|"replace" } };
  credits_tag?: string;
};

type OutputMode = "full" | "split_by_animation" | "split_by_frame" | "both";

type BuildSpec = {
  schema: "ulpc.build/1.0";
  generator?: { project?: string; version?: string };
  meta?: Record<string, unknown>;
  output?: {
    mode?: OutputMode;
    frame_size?: { w: number; h: number }; // optional override
    zero_pad?: number;                      // default 3
    fps?: number;                           // default 8 (slicing manifest)
  };
  animations?: string[]; // which animations to produce; REQUIRED for split_by_animation / split_by_frame
  layers: LayerSpec[];
};

type LayerWarning = {
  category: string;
  variant: string;
  reason: string;
  detail?: string;
  animation?: string;
};

function exists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function readJson<T = any>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")) as T; } catch { return null; }
}
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
  return ["idle","walk","run","slash","thrust","shoot","hurt","jump","sit","emote","climb","combat"];
}

async function resolveLayerPng(categoryIn: string, variantIn: string, animation?: string): Promise<string> {
  // normalization + defensive handling
  let category = categoryIn.replace(/\/+$/,"");
  const variant = variantIn;
  const lowerCat = category.toLowerCase();
  const lowerVar = variant.toLowerCase();
  if (lowerCat.endsWith(`/${lowerVar}`)) {
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
      // If the index provides per-animation PNGs, prefer those
      if (animation && hit?.animations && hit.animations[animation]) {
        const byAnim = hit.animations[animation];
        const png = pngFromVariantJson(indexJson, byAnim);
        if (png && exists(png)) return png;
      }
      // Otherwise general
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

  // 3a) Constructed per-animation path
  {
    const root = resolveUlpcRoot();
    const prefer = animation ? [animation] : animationsFallback();
    for (const a of prefer) {
      const p1 = path.join(root, category, a, `${variant}.png`);
      if (exists(p1)) return p1;
      const p2 = path.join(root, category, a, `${variant}.webp`);
      if (exists(p2)) return p2;
    }
  }

  // 3b) Broad scan
  const root = resolveUlpcRoot();
  const catRoot = path.join(root, category);
  const scanRoot = exists(catRoot) ? catRoot : root;
  const pngs = walkPng(scanRoot, 7);
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
  const candidates = pngs
    .map(norm)
    .filter(p =>
      p.includes(`/${category.toLowerCase()}/`) &&
      p.includes(`/${lowerVar}.`) &&
      (animation ? p.includes(`/${animation.toLowerCase()}/`) : true)
    );

  if (candidates.length) {
    const best = candidates.sort((a, b) => a.length - b.length)[0];
    return best;
  }

  throw new Error(`Unable to resolve PNG for ${category}/${variant}${animation ? ` (animation=${animation})` : ""}`);
}

async function applyTintIfAny(img: sharp.Sharp, layer: LayerSpec): Promise<sharp.Sharp> {
  const hex = layer.color?.tint?.rgb;
  const mode = layer.color?.tint?.mode ?? "multiply";
  if (!hex || mode !== "multiply") return img;
  return img.tint(hex as any);
}

// ────────────────────────────────────────────────────────────────────────────
// Baseline single-sheet compose (kept for compatibility)
// ────────────────────────────────────────────────────────────────────────────
export async function composeULPC(
  build: BuildSpec,
  outPath: string
): Promise<{
  outPath: string;
  bytes: number;
  layers: number;
  width: number;
  height: number;
  warnings: LayerWarning[];
  skipped: number;
}> {
  if (build.schema !== "ulpc.build/1.0") {
    throw new Error(`Unsupported schema: ${build?.schema}`);
  }
  const visible = (build.layers ?? []).filter(l => l.visible !== false);
  if (!visible.length) throw new Error("No visible layers to compose");

  log.info({ msg: "compose.start", defsDir: resolveUlpcSheetDefs(), layers: visible.length });

  // Resolve all layer PNGs (without animation specialization)
  const warnings: LayerWarning[] = [];
  let skippedCount = 0;
  const resolved: Array<{ layer: LayerSpec; png: string; meta: sharp.Metadata }> = [];
  for (const l of visible) {
    try {
      const png = await resolveLayerPng(l.category, l.variant);
      const meta = await sharp(png).metadata();
      if (!(meta.width && meta.height)) {
        warnings.push({ category: l.category, variant: l.variant, reason: "invalid_dimensions", detail: "missing width/height" });
        log.warn?.({ msg: "layer.invalid_dimensions", category: l.category, variant: l.variant, png });
        skippedCount++;
        continue;
      }
      resolved.push({ layer: l, png, meta });
      log.info({ msg: "layer.resolved", category: l.category, variant: l.variant, png });
    } catch (err: any) {
      warnings.push({ category: l.category, variant: l.variant, reason: "resolve_failed", detail: err?.message });
      log.warn?.({ msg: "layer.resolve_failed", category: l.category, variant: l.variant, error: err?.message });
      skippedCount++;
    }
  }

  if (!resolved.length) {
    throw new Error("No layers could be resolved for composition");
  }

  // Canvas size from first accepted layer
  let W = 0;
  let H = 0;

  const overlays: sharp.OverlayOptions[] = [];
  const sorted = resolved
    .map((r, i) => ({ ...r, z: r.layer.z_override ?? i, idx: i }))
    .sort((a, b) => (a.z - b.z) || (a.idx - b.idx));

  for (const r of sorted) {
    const left = r.layer.offset?.x ?? 0;
    const top  = r.layer.offset?.y ?? 0;
    const width = r.meta.width ?? 0;
    const height = r.meta.height ?? 0;
    if (!W || !H) {
      W = width;
      H = height;
    }
    let targetWidth = width;
    let targetHeight = height;
    const crops: string[] = [];

    if (W && width > W) {
      if (width % W === 0) {
        targetWidth = W;
        crops.push(`width ${width}→${W}`);
      } else {
        warnings.push({ category: r.layer.category, variant: r.layer.variant, reason: "dimension_mismatch", detail: `layer ${width}x${height} exceeds base ${W}x${H}` });
        log.warn?.({ msg: "layer.dimension_mismatch", category: r.layer.category, variant: r.layer.variant, layerWidth: width, layerHeight: height, baseWidth: W, baseHeight: H });
        skippedCount++;
        continue;
      }
    }

    if (H && targetHeight > H) {
      if (targetHeight % H === 0) {
        targetHeight = H;
        crops.push(`height ${height}→${H}`);
      } else {
        warnings.push({ category: r.layer.category, variant: r.layer.variant, reason: "dimension_mismatch", detail: `layer ${width}x${height} exceeds base ${W}x${H}` });
        log.warn?.({ msg: "layer.dimension_mismatch", category: r.layer.category, variant: r.layer.variant, layerWidth: width, layerHeight: height, baseWidth: W, baseHeight: H });
        skippedCount++;
        continue;
      }
    }

    let sharpImage = sharp(r.png);
    if (targetWidth !== width || targetHeight !== height) {
      sharpImage = sharpImage.extract({ left: 0, top: 0, width: targetWidth, height: targetHeight });
      warnings.push({ category: r.layer.category, variant: r.layer.variant, reason: "cropped", detail: crops.join(", ") || undefined });
      log.info({ msg: "layer.cropped", category: r.layer.category, variant: r.layer.variant, detail: crops.join(", ") });
    }

    let img = sharpImage.ensureAlpha();
    img = await applyTintIfAny(img, r.layer);
    overlays.push({ input: await img.toBuffer(), left, top });
  }

  if (!W || !H) throw new Error("Cannot infer sheet size from resolved layers");
  if (!overlays.length) {
    throw new Error("No layers remained after filtering invalid overlays");
  }

  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(overlays).png().toFile(outPath);

  const stat = await fsp.stat(outPath);
  return {
    outPath,
    bytes: stat.size,
    layers: overlays.length,
    width: W,
    height: H,
    warnings,
    skipped: skippedCount,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Multi-animation export with optional splitting by animation / frame
// ────────────────────────────────────────────────────────────────────────────
export async function composeULPCExport(params: {
  build: BuildSpec;
  outBaseDir: string;        // character root, e.g. /assets/characters/{slug}
  slug: string;
}): Promise<{
  sheets?: Record<string, { outPath: string; width: number; height: number; }>;
  frames?: Record<string, number>; // animation (or Animation_Orientation) → count
  manifestPath?: string;
  warnings: LayerWarning[];
}> {
  const { build, outBaseDir, slug } = params;
  if (build.schema !== "ulpc.build/1.0") throw new Error(`Unsupported schema: ${build?.schema}`);

  const mode: OutputMode = build.output?.mode ?? "full";
  const zeroPad = build.output?.zero_pad ?? 3;
  const fps = build.output?.fps ?? 8;

  // Animations to produce
  const anims = (build.animations && build.animations.length)
    ? build.animations
    : animationsFallback();

  // Prepare dirs
  const sheetsDir = path.join(outBaseDir, "ulpc");          // per-animation composed sheets
  const framesDir = path.join(outBaseDir, "ulpc_frames");   // sliced frames

  const needSheets = mode === "full" || mode === "split_by_animation" || mode === "both";
  const needFrames = mode === "split_by_frame" || mode === "both";

  const visible = (build.layers ?? []).filter(l => l.visible !== false);
  if (!visible.length) throw new Error("No visible layers to compose");

  const sheets: Record<string, { outPath: string; width: number; height: number; }> = {};
  const framesCount: Record<string, number> = {};
  const manifest = {
    schema: "ulpc.manifest/1.0",
    slug,
    frame_size: build.output?.frame_size ?? undefined as any,
    animations: {} as Record<string, {
      frames: number;
      fps: number;
      sheet?: string;
      orientations?: string[];
      folders: Record<string, string[]>;
    }>
  };

  const allWarnings: LayerWarning[] = [];

  // Resolve per-animation PNG for each layer, compose, optionally slice
  for (const animation of anims) {
    const overlays: sharp.OverlayOptions[] = [];
    let W = 0;
    let H = 0;
    const resolvedPngs: string[] = [];
    const animationWarnings: LayerWarning[] = [];

    for (let i = 0; i < visible.length; i++) {
      const L = visible[i];
      try {
        const png = await resolveLayerPng(L.category, L.variant, animation);
        const meta = await sharp(png).metadata();
        if (!(meta.width && meta.height)) {
          animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "invalid_dimensions", detail: "missing width/height" });
          log.warn?.({ msg: "layer.invalid_dimensions", category: L.category, variant: L.variant, animation, png });
          continue;
        }

        let width = meta.width ?? 0;
        let height = meta.height ?? 0;
        if (!W || !H) {
          W = width;
          H = height;
        }

        let targetWidth = width;
        let targetHeight = height;
        const crops: string[] = [];

        if (W && width > W) {
          if (width % W === 0) {
            targetWidth = W;
            targetHeight = Math.min(targetHeight, H);
            crops.push(`width ${width}→${W}`);
          } else {
            animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "dimension_mismatch", detail: `layer ${width}x${height} exceeds base ${W}x${H}` });
            log.warn?.({ msg: "layer.dimension_mismatch", category: L.category, variant: L.variant, animation, layerWidth: width, layerHeight: height, baseWidth: W, baseHeight: H });
            continue;
          }
        }

        if (H && targetHeight > H) {
          if (targetHeight % H === 0) {
            targetHeight = H;
            crops.push(`height ${height}→${H}`);
          } else {
            animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "dimension_mismatch", detail: `layer ${width}x${height} exceeds base ${W}x${H}` });
            log.warn?.({ msg: "layer.dimension_mismatch", category: L.category, variant: L.variant, animation, layerWidth: width, layerHeight: height, baseWidth: W, baseHeight: H });
            continue;
          }
        }

        let workingSharp = sharp(png);
        if (targetWidth !== width || targetHeight !== height) {
          workingSharp = workingSharp.extract({ left: 0, top: 0, width: targetWidth, height: targetHeight });
          animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "cropped", detail: crops.join(", ") || undefined });
          log.info({ msg: "layer.cropped", category: L.category, variant: L.variant, animation, detail: crops.join(", ") });
        }

        let img = workingSharp.ensureAlpha();
        img = await applyTintIfAny(img, L);
        overlays.push({
          input: await img.toBuffer(),
          left: L.offset?.x ?? 0,
          top:  L.offset?.y ?? 0,
        });
        resolvedPngs.push(png);
      } catch (err: any) {
        animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "resolve_failed", detail: err?.message });
        log.warn?.({ msg: "layer.resolve_failed", category: L.category, variant: L.variant, animation, error: err?.message });
      }
    }

    allWarnings.push(...animationWarnings);

    if (!W || !H) {
      log.warn?.({ msg: "compose.animation_skipped", animation, reason: "unable_to_infer_dimensions" });
      continue;
    }
    if (!overlays.length) {
      log.warn?.({ msg: "compose.animation_skipped", animation, reason: "no_layers_after_filter" });
      continue;
    }

    // 2) Compose to a sheet if needed
    let composedPath = "";
    if (needSheets) {
      const outPath = path.join(sheetsDir, animation, "sheet.png");
      await fsp.mkdir(path.dirname(outPath), { recursive: true });
      await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(overlays).png().toFile(outPath);
      sheets[animation] = { outPath, width: W, height: H };
      composedPath = outPath;
      log.info({ msg: "compose.sheet.done", animation, outPath, width: W, height: H });
    } else {
      const tmp = path.join(sheetsDir, animation, `__tmp_${Date.now()}.png`);
      await fsp.mkdir(path.dirname(tmp), { recursive: true });
      await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(overlays).png().toFile(tmp);
      composedPath = tmp;
    }

    // 3) Slice to frames (if requested)
    if (needFrames) {
      if (!resolvedPngs.length) {
        log.warn?.({ msg: "compose.animation_skip_frames", animation, reason: "no_reference_pngs" });
        continue;
      }
      const grid = await resolveGridInfo({ animation, sheetsW: W, sheetsH: H, resolvedPngs, frameSizeOverride: build.output?.frame_size });
      const outDir = framesDir;
      const result = await sliceSheetByGrid({
        sheetPath: composedPath,
        outDir,
        slug,
        animationName: animation,
        zeroPad,
        fps,
        orientationDirs: true,
        grid
      });

      Object.entries(result.manifest.frames).forEach(([folder, arr]) => {
        framesCount[folder] = arr.length;
      });

      manifest.animations[animation] = {
        frames: result.totalFrames,
        fps,
        sheet: needSheets ? sheets[animation]?.outPath : undefined,
        orientations: result.manifest.orientations,
        folders: result.manifest.frames,
      };
    }
  }

  // Write manifest if we sliced frames
  let manifestPath: string | undefined;
  if (needFrames) {
    const p = path.join(outBaseDir, `${slug}_sprite_manifest.json`);
    await fsp.writeFile(p, JSON.stringify(manifest, null, 2), "utf8");
    manifestPath = p;
  }

  return {
    sheets: Object.keys(sheets).length ? sheets : undefined,
    frames: Object.keys(framesCount).length ? framesCount : undefined,
    manifestPath,
    warnings: allWarnings,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Grid resolution – try metadata from defs first, then safe fallbacks
// ────────────────────────────────────────────────────────────────────────────
async function resolveGridInfo(params: {
  animation: string;
  sheetsW: number; sheetsH: number;
  resolvedPngs: string[];
  frameSizeOverride?: { w: number; h: number } | undefined;
}): Promise<GridInfo> {
  const { animation, sheetsW: W, sheetsH: H, resolvedPngs, frameSizeOverride } = params;

  // 0) explicit override
  if (frameSizeOverride?.w && frameSizeOverride?.h) {
    const cols = Math.max(1, Math.floor(W / frameSizeOverride.w));
    const rows = Math.max(1, Math.floor(H / frameSizeOverride.h));
    return { frame_w: frameSizeOverride.w, frame_h: frameSizeOverride.h, rows, cols };
  }

  // 1) try reading adjacent JSON defs (variant or index) for the FIRST resolved layer
  // (Assumption: all layers are same grid layout; if not, the first layer dictates.)
  const first = resolvedPngs[0];
  const defsDir = resolveUlpcSheetDefs();

  // best-effort: walk back from spritesheets path to a parallel sheet_definitions json
  // category is not known here; but ULPC often mirrors tree structure so we try:
  const candidateJsons: string[] = [];

  // If the resolved png is at .../spritesheets/<category>/<anim>/<variant>.png,
  // we try .../sheet_definitions/<category>/index.json then <variant>.json
  try {
    const idxSprites = first.split(path.sep).reverse();
    const vFile = idxSprites[0];                      // {variant}.png
    const animDir = idxSprites[1];                    // {animation}
    const categoryParts = idxSprites.slice(2).reverse(); // .../<category>/...
    const categoryRel = categoryParts.join(path.sep);
    const catJson = path.join(defsDir, categoryRel, "index.json");
    const varJson = path.join(defsDir, categoryRel, vFile.replace(/\.(png|webp)$/i, ".json"));
    candidateJsons.push(catJson, varJson);
  } catch { /* ignore */ }

  for (const jsonPath of candidateJsons) {
    if (!exists(jsonPath)) continue;
    const j = readJson<any>(jsonPath);
    if (!j) continue;

    // Common shapes we support:
    // - { animations: { idle: { frame_w, frame_h, rows, cols, directions? }, ... } }
    // - { animations: [{ name, frame_w, frame_h, rows, cols, directions }] }
    // - { frame: { w, h }, rows, cols, directions? }
    // - { grid: { w, h, rows, cols } }
    const byKey = j?.animations?.[animation];
    if (byKey && (byKey.frame_w || byKey.frameWidth || byKey.frame?.w)) {
      const g = normalizeGrid(byKey, W, H);
      if (g) return g;
    }
    if (Array.isArray(j?.animations)) {
      const hit = j.animations.find((x: any) => x?.name === animation);
      if (hit) {
        const g = normalizeGrid(hit, W, H);
        if (g) return g;
      }
    }
    // flat shapes
    if (j?.frame || j?.rows || j?.cols || j?.grid) {
      const g = normalizeGrid(j, W, H);
      if (g) return g;
    }
  }

  // 2) safe fallbacks:
  // Try 64x64 tiles (classical LPC). If divisible, use that.
  if (W % 64 === 0 && H % 64 === 0) {
    return { frame_w: 64, frame_h: 64, cols: W / 64, rows: H / 64, directions: (H/64) >= 4 ? ["front","left","right","back"] : undefined };
  }

  // Try "square tiles" by assuming rows=4 if tall enough
  const rowsGuess = H >= W ? 4 : 1;
  const frame_h = Math.floor(H / rowsGuess);
  const frame_w = frame_h; // square fallback
  if (frame_w > 0 && frame_h > 0 && W % frame_w === 0 && H % frame_h === 0) {
    return { frame_w, frame_h, cols: W / frame_w, rows: H / frame_h, directions: rowsGuess >= 4 ? ["front","left","right","back"] : undefined };
  }

  // Last resort: single row (whole sheet in one row)
  return { frame_w: W, frame_h: H, cols: 1, rows: 1 };
}

function normalizeGrid(anyShape: any, sheetW: number, sheetH: number): GridInfo | null {
  const fw = anyShape?.frame_w ?? anyShape?.frameWidth ?? anyShape?.frame?.w ?? anyShape?.grid?.w;
  const fh = anyShape?.frame_h ?? anyShape?.frameHeight ?? anyShape?.frame?.h ?? anyShape?.grid?.h;
  const rows = anyShape?.rows ?? anyShape?.grid?.rows;
  const cols = anyShape?.cols ?? anyShape?.columns ?? anyShape?.grid?.cols;

  const dirRaw = anyShape?.directions ?? anyShape?.facings ?? anyShape?.orientation ?? anyShape?.faces;
  const dir = Array.isArray(dirRaw) ? dirRaw.map((s: string) => {
    const n = s.toLowerCase();
    if (n.startsWith("down") || n.startsWith("south") || n.startsWith("front")) return "front";
    if (n.startsWith("up") || n.startsWith("north") || n.startsWith("back")) return "back";
    if (n.startsWith("left") || n.startsWith("west")) return "left";
    if (n.startsWith("right") || n.startsWith("east")) return "right";
    return "front";
  }) as ("front"|"back"|"left"|"right")[] : undefined;

  if (fw && fh && rows && cols) return { frame_w: fw, frame_h: fh, rows, cols, directions: dir ?? undefined };

  // If only frame size defined, derive rows/cols
  if (fw && fh) {
    if (sheetW % fw === 0 && sheetH % fh === 0) {
      return { frame_w: fw, frame_h: fh, rows: sheetH / fh, cols: sheetW / fw, directions: dir ?? undefined };
    }
  }
  return null;
}
