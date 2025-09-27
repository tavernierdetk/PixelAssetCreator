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

type ResolvedLayerImage = {
  primary: ResolvedLayerEntry;
  extras?: ResolvedLayerEntry[];
  availableAnimations: string[];
};

type ResolvedLayerEntry = {
  png: string;
  usedAnimation?: string | null;
  role?: "primary" | "behind";
  z?: number | null;
};

function buildAnimationPriority(requested?: string): string[] {
  const priority: string[] = [];
  const add = (anim?: string) => {
    if (!anim) return;
    const clean = anim.trim();
    if (!clean) return;
    if (!priority.includes(clean)) priority.push(clean);
  };
  add(requested);
  add("idle");
  add("walk");
  for (const anim of animationsFallback()) add(anim);
  return priority;
}

async function resolveLayerPngDetailed(
  categoryIn: string,
  variantIn: string,
  animation: string
): Promise<ResolvedLayerImage> {
  const originalCategory = categoryIn.replace(/\/+$/, "");
  let category = originalCategory;
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
  const preferAnimations = buildAnimationPriority(animation);

  // 1) <category>/<variant>.json (non-animation specific)
  if (exists(directJson)) {
    const def = readJson(directJson);
    const png = def && pngFromVariantJson(directJson, def);
    if (png && exists(png)) {
      const meta = getLayerMetaForPath(originalCategory);
      return {
        primary: { png, usedAnimation: null, role: "primary", z: zFromMeta(meta) ?? null },
        availableAnimations: animationsFallback(),
      };
    }
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
      // Prefer animations when available within the index
      if (hit?.animations && typeof hit.animations === "object") {
        const available = Object.keys(hit.animations).filter(Boolean);
        for (const anim of preferAnimations) {
          const byAnim = hit.animations[anim];
          if (!byAnim) continue;
          const png = pngFromVariantJson(indexJson, byAnim);
          if (png && exists(png)) {
            const meta = getLayerMetaForPath(originalCategory);
            return {
              primary: { png, usedAnimation: anim, role: "primary", z: zFromMeta(meta) ?? null },
              availableAnimations: available,
            };
          }
        }
      }

      const png = pngFromVariantJson(indexJson, hit);
      if (png && exists(png)) {
        const meta = getLayerMetaForPath(originalCategory);
        return {
          primary: { png, usedAnimation: null, role: "primary", z: zFromMeta(meta) ?? null },
          availableAnimations: animationsFallback(),
        };
      }
      const ref = hit.json ?? hit.def ?? hit.variant;
      if (ref) {
        const refAbs = toAbs(indexJson, ref);
        if (exists(refAbs)) {
          const sub = readJson(refAbs);
          const p2 = pngFromVariantJson(refAbs, sub);
          if (p2 && exists(p2)) {
            const meta = getLayerMetaForPath(originalCategory);
            return {
              primary: { png: p2, usedAnimation: null, role: "primary", z: zFromMeta(meta) ?? null },
              availableAnimations: animationsFallback(),
            };
          }
        }
      }
    }
  }

  // 3a) Constructed per-animation path
  {
    const root = resolveUlpcRoot();
    const available: string[] = [];
    const categoriesToTry = [originalCategory];
    if (!categoriesToTry.includes(category)) categoriesToTry.push(category);

    for (const cat of categoriesToTry) {
      for (const anim of preferAnimations) {
        const primary = pickAnimationSheet(root, cat, anim, variant);
        if (!primary) continue;

        if (!available.includes(anim)) available.push(anim);

        const extras: ResolvedLayerEntry[] = [];
        const behind = pickBehindSheet(root, cat, anim, variant);
        if (behind) {
          const behindMeta = getLayerMetaForPath(`${cat}/universal_behind`) ??
            (cat !== originalCategory ? getLayerMetaForPath(`${originalCategory}/universal_behind`) : null);
          extras.push({ ...behind, role: "behind", z: zFromMeta(behindMeta) ?? null });
        }

        const primaryMeta = getLayerMetaForPath(cat) ??
          (cat !== originalCategory ? getLayerMetaForPath(originalCategory) : null);
        return {
          primary: { ...primary, role: "primary", z: zFromMeta(primaryMeta) ?? null },
          extras: extras.length ? extras : undefined,
          availableAnimations: available.length ? available : animationsFallback(),
        };
      }
    }
  }

  // 3b) Broad scan
  const root = resolveUlpcRoot();
  const categoriesToScan = [originalCategory];
  if (!categoriesToScan.includes(category)) categoriesToScan.push(category);
  const scanRoots = categoriesToScan
    .map((cat) => {
      const catRoot = path.join(root, cat);
      return exists(catRoot) ? catRoot : null;
    })
    .filter((p): p is string => Boolean(p));

  if (!scanRoots.length) scanRoots.push(root);

  const seenRoots = new Set<string>();
  const pngs = scanRoots
    .filter((r) => {
      if (seenRoots.has(r)) return false;
      seenRoots.add(r);
      return true;
    })
    .flatMap((r) => walkPng(r, 7));
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
  const candidates = pngs
    .map((p) => ({ abs: p, norm: norm(p) }))
    .filter((p) =>
      p.norm.includes(`/${category.toLowerCase()}/`) &&
      p.norm.includes(`/${lowerVar}.`)
    );

  if (candidates.length) {
    const best = candidates.sort((a, b) => a.norm.length - b.norm.length)[0];
    const animMatch = best.norm.match(/\/(idle|walk|run|slash|thrust|shoot|hurt|jump|sit|emote|climb|combat)\//);
    const matchAnim = animMatch ? animMatch[1] : null;

    const extras: ResolvedLayerEntry[] = [];
    if (matchAnim) {
      const behindCandidate = deriveBehindFromPath(best.abs, matchAnim);
      if (behindCandidate) extras.push({ ...behindCandidate, role: "behind" });
    }

    const derivedCategory = categoryFromSpritePath(best.abs) ?? originalCategory;
    const primaryMeta = getLayerMetaForPath(derivedCategory);

    return {
      primary: { png: best.abs, usedAnimation: matchAnim ?? undefined, role: "primary", z: zFromMeta(primaryMeta) ?? null },
      extras: extras.length ? extras : undefined,
      availableAnimations: matchAnim ? [matchAnim] : animationsFallback(),
    };
  }

  throw new Error(`Unable to resolve PNG for ${category}/${variant}${animation ? ` (animation=${animation})` : ""}`);
}

function exists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

type LayerMeta = {
  zPos?: number;
  customAnimation?: string | null;
};

let layerMetaCache: Map<string, LayerMeta> | null = null;

function normalizeCategoryKey(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function loadLayerMetaCache(): Map<string, LayerMeta> {
  if (layerMetaCache) return layerMetaCache;
  const cache = new Map<string, LayerMeta>();
  const defsDir = resolveUlpcSheetDefs();

  const capture = (rawPath: unknown, layer: any) => {
    if (typeof rawPath !== "string") return;
    const key = normalizeCategoryKey(rawPath);
    if (!key) return;

    const candidate: LayerMeta = {
      zPos: typeof layer?.zPos === "number" ? layer.zPos : undefined,
      customAnimation: typeof layer?.custom_animation === "string" ? layer.custom_animation : null,
    };

    const existing = cache.get(key);
    if (!existing) {
      cache.set(key, candidate);
      return;
    }

    const existingHasCustom = !!existing.customAnimation;
    const candidateHasCustom = !!candidate.customAnimation;

    if (existingHasCustom && !candidateHasCustom) {
      cache.set(key, candidate);
      return;
    }

    if (existingHasCustom === candidateHasCustom) {
      if ((existing.zPos ?? null) == null && (candidate.zPos ?? null) != null) {
        cache.set(key, { ...existing, zPos: candidate.zPos });
      }
    }
  };

  const scan = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const def = readJson<any>(full);
      if (!def || typeof def !== "object") continue;

      for (const [layerKey, layerValue] of Object.entries(def)) {
        if (!layerKey.startsWith("layer_")) continue;
        if (!layerValue || typeof layerValue !== "object") continue;
        const layer = layerValue as any;
        for (const layerPath of Object.values(layer)) {
          capture(layerPath, layer);
        }
      }
    }
  };

  scan(defsDir);
  layerMetaCache = cache;
  return cache;
}

function getLayerMetaForPath(categoryPath: string): LayerMeta | null {
  if (!categoryPath) return null;
  const key = normalizeCategoryKey(categoryPath);
  if (!key) return null;
  const cache = loadLayerMetaCache();
  return cache.get(key) ?? null;
}

function zFromMeta(meta: LayerMeta | null): number | undefined {
  if (!meta) return undefined;
  if (meta.customAnimation) return undefined;
  return typeof meta.zPos === "number" ? meta.zPos : undefined;
}

function pickAnimationSheet(root: string, category: string, animation: string, variant: string): ResolvedLayerEntry | null {
  const pngPath = path.join(root, category, animation, `${variant}.png`);
  if (exists(pngPath)) return { png: pngPath, usedAnimation: animation };
  const webpPath = path.join(root, category, animation, `${variant}.webp`);
  if (exists(webpPath)) return { png: webpPath, usedAnimation: animation };
  return null;
}

function pickBehindSheet(root: string, category: string, animation: string, variant: string): ResolvedLayerEntry | null {
  const segments = category.split(/[/\\]/).map((s) => s.toLowerCase());
  if (segments.includes("universal_behind")) return null;
  const base = path.join(root, category, "universal_behind", animation);
  const pngPath = path.join(base, `${variant}.png`);
  if (exists(pngPath)) return { png: pngPath, usedAnimation: animation };
  const webpPath = path.join(base, `${variant}.webp`);
  if (exists(webpPath)) return { png: webpPath, usedAnimation: animation };
  return null;
}

function categoryFromSpritePath(absPath: string): string | null {
  const root = resolveUlpcRoot();
  const rel = path.relative(root, absPath);
  if (rel.startsWith("..")) return null;
  const parts = rel.replace(/\\/g, "/").split("/");
  if (parts.length < 3) return null;
  parts.pop(); // variant file
  parts.pop(); // animation
  const category = parts.join("/");
  return category ? category : null;
}

function deriveBehindFromPath(primaryPath: string, animation: string): ResolvedLayerEntry | null {
  const dir = path.dirname(primaryPath);
  const variantFile = path.basename(primaryPath);
  const animSegment = path.basename(dir);
  if (animSegment.toLowerCase() !== animation.toLowerCase()) return null;
  const categoryDir = path.dirname(dir);
  if (!categoryDir || !categoryDir.length) return null;
  if (categoryDir.split(path.sep).map((s) => s.toLowerCase()).includes("universal_behind")) return null;

  const primaryCategory = categoryFromSpritePath(primaryPath);
  const candidate = path.join(categoryDir, "universal_behind", animation, variantFile);
  const categoryRel = categoryFromSpritePath(candidate) ?? (primaryCategory ? `${primaryCategory}/universal_behind` : null);
  if (exists(candidate)) {
    const meta = categoryRel ? getLayerMetaForPath(categoryRel) : null;
    return { png: candidate, usedAnimation: animation, z: zFromMeta(meta) ?? null };
  }
  const webpCandidate = candidate.replace(/\.png$/i, ".webp");
  if (webpCandidate !== candidate && exists(webpCandidate)) {
    const meta = categoryRel ? getLayerMetaForPath(categoryRel) : null;
    return { png: webpCandidate, usedAnimation: animation, z: zFromMeta(meta) ?? null };
  }
  return null;
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

const DEFAULT_ANIMS = [
  "walk",
  "idle",
  "run",
  "slash",
  "thrust",
  "shoot",
  "hurt",
  "jump",
  "sit",
  "emote",
  "climb",
  "combat",
];

function animationsFallback(): string[] {
  const env = process.env.ULPC_ANIMS_FALLBACK;
  if (env && env.trim()) {
    const overrides = env.split(",").map((s) => s.trim()).filter(Boolean);
    return overrides.length ? overrides : [...DEFAULT_ANIMS];
  }
  return [...DEFAULT_ANIMS];
}


async function applyTintIfAny(img: sharp.Sharp, layer: LayerSpec): Promise<sharp.Sharp> {
  const hex = layer.color?.tint?.rgb;
  const mode = layer.color?.tint?.mode ?? "multiply";
  if (!hex || mode !== "multiply") return img;
  return img.tint(hex as any);
}

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
    const overlayQueue: Array<{ overlay: sharp.OverlayOptions; z: number; order: number; role?: string }> = [];
    let overlayOrder = 0;
    let W = 0;
    let H = 0;
    const resolvedPngs: string[] = [];
    const animationWarnings: LayerWarning[] = [];

    for (let i = 0; i < visible.length; i++) {
      const L = visible[i];
      try {
        const resolvedImage = await resolveLayerPngDetailed(L.category, L.variant, animation);
        const entries: ResolvedLayerEntry[] = [
          ...(resolvedImage.extras?.filter((e) => e.role === "behind") ?? []),
          resolvedImage.primary,
          ...(resolvedImage.extras?.filter((e) => e.role !== "behind") ?? []),
        ];

        for (const entry of entries) {
          const png = entry.png;
          const meta = await sharp(png).metadata();
          if (!(meta.width && meta.height)) {
            const detail = `missing width/height${entry.role ? ` (${entry.role})` : ""}`;
            animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "invalid_dimensions", detail });
            log.warn?.({ msg: "layer.invalid_dimensions", category: L.category, variant: L.variant, animation, png, role: entry.role });
            continue;
          }

          let width = meta.width ?? 0;
          let height = meta.height ?? 0;
          if (!W || !H) {
            W = width;
            H = height;
          }

          if (animation && entry.usedAnimation && entry.usedAnimation !== animation) {
            animationWarnings.push({
              category: L.category,
              variant: L.variant,
              animation,
              reason: "animation_fallback",
              detail: `used ${entry.usedAnimation}${entry.role ? ` (${entry.role})` : ""}`,
            });
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
            animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "dimension_mismatch", detail: `layer ${width}x${height} exceeds base ${W}x${H}${entry.role ? ` (${entry.role})` : ""}` });
              log.warn?.({ msg: "layer.dimension_mismatch", category: L.category, variant: L.variant, animation, layerWidth: width, layerHeight: height, baseWidth: W, baseHeight: H, role: entry.role });
              continue;
            }
          }

          if (H && targetHeight > H) {
            if (targetHeight % H === 0) {
              targetHeight = H;
              crops.push(`height ${height}→${H}`);
            } else {
              animationWarnings.push({ category: L.category, variant: L.variant, animation, reason: "dimension_mismatch", detail: `layer ${width}x${height} exceeds base ${W}x${H}${entry.role ? ` (${entry.role})` : ""}` });
              log.warn?.({ msg: "layer.dimension_mismatch", category: L.category, variant: L.variant, animation, layerWidth: width, layerHeight: height, baseWidth: W, baseHeight: H, role: entry.role });
              continue;
            }
          }

          let workingSharp = sharp(png);
          if (targetWidth !== width || targetHeight !== height) {
            workingSharp = workingSharp.extract({ left: 0, top: 0, width: targetWidth, height: targetHeight });
            const cropDetailRaw = crops.join(", ");
            const cropDetail = cropDetailRaw ? cropDetailRaw : undefined;
            animationWarnings.push({
              category: L.category,
              variant: L.variant,
              animation,
              reason: "cropped",
              detail: cropDetail ? `${cropDetail}${entry.role ? ` (${entry.role})` : ""}` : (entry.role ? `applied for ${entry.role}` : undefined),
            });
            log.info({ msg: "layer.cropped", category: L.category, variant: L.variant, animation, detail: cropDetailRaw, role: entry.role });
          }

          let img = workingSharp.ensureAlpha();
          img = await applyTintIfAny(img, L);
          const zBaseRaw = L.z_override ?? entry.z ?? i;
          const zValue = typeof zBaseRaw === "number" ? zBaseRaw : Number(zBaseRaw ?? i);
          overlayQueue.push({
            overlay: {
              input: await img.toBuffer(),
              left: L.offset?.x ?? 0,
              top:  L.offset?.y ?? 0,
            },
            z: Number.isFinite(zValue) ? zValue : i,
            order: overlayOrder++,
            role: entry.role,
          });

          if (entry === resolvedImage.primary) {
            resolvedPngs.push(png);
          }
        }
      } catch (err: any) {
        const message = err?.message ?? "";
        const reason = message.includes("Unable to resolve PNG") ? "missing_animation" : "resolve_failed";
        animationWarnings.push({ category: L.category, variant: L.variant, animation, reason, detail: message });
        log.warn?.({ msg: "layer.resolve_failed", category: L.category, variant: L.variant, animation, error: err?.message });
      }
    }

    allWarnings.push(...animationWarnings);

    if (!W || !H) {
      log.warn?.({ msg: "compose.animation_skipped", animation, reason: "unable_to_infer_dimensions" });
      continue;
    }
    const overlays = overlayQueue
      .sort((a, b) => {
        if (a.z !== b.z) return a.z - b.z;
        return a.order - b.order;
      })
      .map((item) => item.overlay);

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
    return {
      frame_w: 64,
      frame_h: 64,
      cols: W / 64,
      rows: H / 64,
      directions: (H / 64) >= 4 ? ["front", "left", "back", "right"] : undefined,
    };
  }

  // Try "square tiles" by assuming rows=4 if tall enough
  const rowsGuess = H >= W ? 4 : 1;
  const frame_h = Math.floor(H / rowsGuess);
  const frame_w = frame_h; // square fallback
  if (frame_w > 0 && frame_h > 0 && W % frame_w === 0 && H % frame_h === 0) {
    return {
      frame_w,
      frame_h,
      cols: W / frame_w,
      rows: H / frame_h,
      directions: rowsGuess >= 4 ? ["front", "left", "back", "right"] : undefined,
    };
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
