// apps/api/src/routes/tilesets.ts
import { Router, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import path, { join, resolve } from "node:path";
import { Queue } from "bullmq";
import sharp from "sharp";

// Safe fallbacks for config helpers
import * as config from "@pixelart/config";
import { createLogger } from "@pixelart/log";
import { generatePortraitOpenAI } from "@pixelart/adapters";
import { listPatterns, hasPattern, PATTERNS } from "@pixelart/tileset-compose";

const log = createLogger("@api/tilesets");

// ────────────────────────────────────────────────────────────────────────────
// Safe config helpers
// ────────────────────────────────────────────────────────────────────────────
const SAFE_SEGMENT = /^[a-z0-9._-]+$/i;
const META_BASENAME = "meta.json";

const TILESET_ROOT: string =
  (config as any).TILESET_ROOT ??
  process.env.TILESET_ROOT ??
  resolve(process.cwd(), "..", "..", "assets", "tilesets");

const ensureDir: (p: string) => Promise<void> =
  (config as any).ensureDir ??
  (async (p: string) => {
    await fs.mkdir(p, { recursive: true } as any);
  });

function tilesetDir(slug: string): string {
  return (config as any).tilesetDir ? (config as any).tilesetDir(slug) : join(TILESET_ROOT, slug);
}

async function readMeta(slug: string): Promise<any | null> {
  const fp = join(tilesetDir(slug), META_BASENAME);
  try {
    const buf = await fs.readFile(fp);
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

async function writeMeta(slug: string, meta: any): Promise<void> {
  await ensureDir(tilesetDir(slug));
  const fp = join(tilesetDir(slug), META_BASENAME);
  await fs.writeFile(fp, JSON.stringify(meta, null, 2));
}

// Load a pattern-specific tile dictionary (material-aware when needed)
async function loadPatternDict(
  pattern: string,
  material = "grass"
): Promise<null | { global_preamble?: string; tiles: { id: number; name: string; prompt: string }[] }> {
  try {
    if (pattern === "blob47") {
      const rel =
        material === "mask"
          ? "../../../../packages/tileset-compose/prompts/blob47_mask.json"
          : "../../../../packages/tileset-compose/prompts/blob47_grass.json";
      const fp = new URL(rel, import.meta.url).pathname;
      const raw = await fs.readFile(fp, "utf8");
      const json = JSON.parse(raw);
      return { global_preamble: json.global_preamble, tiles: json.tiles ?? [] };
    }
    return null;
  } catch (e) {
    log.warn({ pattern, material, err: (e as any)?.message }, "loadPatternDict_failed");
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
export const tilesets: Router = Router();      // prod routes
export const tilesetDebug: Router = Router();  // debug / prompt-testing routes

const connection = { connection: { url: process.env.REDIS_URL || "redis://localhost:6379" } };
const tilesetQ = new Queue("tileset", connection);

// ────────────────────────────────────────────────────────────────────────────
// PROD: Patterns registry
// GET /tileset-patterns
// ────────────────────────────────────────────────────────────────────────────
tilesets.get("/tileset-patterns", (_req: Request, res: Response) => {
  return res.json({ ok: true, patterns: listPatterns() });
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: List tilesets
// GET /tilesets
// ────────────────────────────────────────────────────────────────────────────
tilesets.get("/tilesets", async (_req: Request, res: Response) => {
  try {
    const entries = await fs.readdir(TILESET_ROOT, { withFileTypes: true }).catch(() => []);
    const slugs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => a.localeCompare(b));
    return res.json({ ok: true, slugs, root: TILESET_ROOT });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: Meta
// GET /tilesets/:slug/meta
// ────────────────────────────────────────────────────────────────────────────
tilesets.get("/tilesets/:slug/meta", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const meta = await readMeta(slug);
    return res.json({ ok: true, meta });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: Enqueue job (immutable pattern per slug)
// POST /tilesets/:slug/enqueue
// body: { pattern: string; material?: string; mode?: "direct"|"mask"; paletteName?: string; }
// ────────────────────────────────────────────────────────────────────────────
tilesets.post("/tilesets/:slug/enqueue", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });

    const { pattern, material = "grass", mode = "direct", paletteName = "roman_steampunk" } = (req.body ?? {});
    if (!pattern || typeof pattern !== "string" || !hasPattern(pattern)) {
      return res.status(400).json({ ok: false, error: "invalid_pattern", allowed: Object.keys(PATTERNS) });
    }

    await ensureDir(tilesetDir(slug));
    const existing = await readMeta(slug);

    if (!existing) {
      const meta = {
        schema: "tileset.meta/1.0",
        slug,
        pattern,
        tile_size: (PATTERNS as any)[pattern]?.tileSize ?? 32,
        palette: paletteName,
        created_at: new Date().toISOString(),
      };
      await writeMeta(slug, meta);
    } else if (existing.pattern !== pattern) {
      return res.status(409).json({ ok: false, reason: "pattern_mismatch", have: existing.pattern, want: pattern });
    }

    const job = await tilesetQ.add("generate", { slug, pattern, material, mode, paletteName }, { removeOnComplete: true, removeOnFail: 25 });
    return res.json({ ok: true, jobId: job.id });
  } catch (e: any) {
    log.error({ err: e }, "enqueue_failed");
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: Serve files (png/webp/json only)
// GET /tilesets/:slug/files/*
// ────────────────────────────────────────────────────────────────────────────
tilesets.get("/tilesets/:slug/files/*", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).end("Bad slug");
    const rel = (req.params as any)[0] as string;
    const segments = (rel ?? "").split("/").filter(Boolean);
    if (!segments.length || !segments.every((s: string) => SAFE_SEGMENT.test(s))) {
      return res.status(400).end("Bad filename");
    }
    const leaf = segments[segments.length - 1];
    if (!/\.(png|webp|json)$/i.test(leaf)) return res.status(403).end("Forbidden");

    const filePath = join(tilesetDir(slug), ...segments);
    await fs.access(filePath).catch(() => { throw Object.assign(new Error("Not found"), { status: 404 }); });
    res.sendFile(path.resolve(filePath));
  } catch (e: any) {
    return res.status(e?.status ?? 500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: List files under a tileset (recursive; png/webp/json)
// GET /tilesets/:slug/assets
// ────────────────────────────────────────────────────────────────────────────
tilesets.get("/tilesets/:slug/assets", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });

    const base = tilesetDir(slug);
    await ensureDir(base);

    async function walk(relDir = ""): Promise<string[]> {
      const absDir = join(base, relDir);
      const entries = await fs.readdir(absDir, { withFileTypes: true }).catch(() => []);
      const out: string[] = [];
      for (const e of entries) {
        const relPath = relDir ? `${relDir}/${e.name}` : e.name;
        if (!SAFE_SEGMENT.test(e.name)) continue;
        if (e.isDirectory()) {
          out.push(...(await walk(relPath)));
        } else if (/\.(png|webp|json)$/i.test(e.name)) {
          out.push(relPath);
        }
      }
      return out.sort((a, b) => a.localeCompare(b));
    }

    const files = await walk("");
    return res.json({ ok: true, files });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: Tile specs for this slug
// GET /tilesets/:slug/tilespecs
// ────────────────────────────────────────────────────────────────────────────
tilesets.get("/tilesets/:slug/tilespecs", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const meta = await readMeta(slug);
    const pattern = meta?.pattern ?? "blob47";
    const dict = await loadPatternDict(pattern, "grass");
    if (!dict) return res.status(404).json({ ok: false, error: "tilespecs_not_found" });
    return res.json({ ok: true, pattern, tiles: dict.tiles, preamble: dict.global_preamble ?? "" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DEBUG helpers (prompt compose, resize, stitch)
// ────────────────────────────────────────────────────────────────────────────
function oneline(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** Minimal, de-duplicated prompt builder
 * Order:
 *  [Preamble] …  [Slot] …  Palette: …  (user extra…)
 */
function composePrompt(p: {
  preamble?: string;
  tileInstruction?: string;
  palette?: string;
  user?: string;
}) {
  const parts = [
    p.preamble ? `[Preamble] ${oneline(p.preamble)}` : "",
    p.tileInstruction ? `[Slot] ${oneline(p.tileInstruction)}` : "",
    p.palette ? `Palette: ${p.palette}.` : "",
    p.user && p.user.trim() ? p.user.trim() : "",
  ].filter(Boolean);
  return parts.join(" ");
}

async function toTile32(buf: Buffer, size = 32): Promise<Buffer> {
  return sharp(buf).resize(size, size, { kernel: sharp.kernel.nearest, fit: "cover" }).png().toBuffer();
}

async function stitchSheetSimpleByPattern(outDir: string, pattern: string, tileSize = 32): Promise<{ sheetPath: string; count: number }> {
  await ensureDir(outDir);
  const tilesDir = join(outDir, "tiles");
  await ensureDir(tilesDir);

  const names = (await fs.readdir(tilesDir).catch(() => []))
    .filter((n) => n.startsWith(`${pattern}_`) && /\.png$/i.test(n));

  const { cols, rows } = (PATTERNS as any)[pattern]?.grid ?? { cols: 8, rows: 6 };
  const W = cols * tileSize; const H = rows * tileSize;
  const base = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();

  const overlays: sharp.OverlayOptions[] = [];
  const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));
  const fallback: string[] = [];

  const coordRe = new RegExp(`^${pattern}_r(\\d+)_c(\\d+)\\.png$`, "i");
  for (const name of names) {
    const m = name.match(coordRe);
    if (m) {
      const r = Number(m[1]), c = Number(m[2]);
      if (r >= 0 && c >= 0 && r < rows && c < cols) {
        overlays.push({ input: await fs.readFile(join(tilesDir, name)), left: c * tileSize, top: r * tileSize });
        occupied[r][c] = true;
        continue;
      }
    }
    fallback.push(name);
  }

  outer: for (const name of fallback) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!occupied[r][c]) {
        overlays.push({ input: await fs.readFile(join(tilesDir, name)), left: c * tileSize, top: r * tileSize });
        occupied[r][c] = true;
        continue outer;
      }
    }
  }

  const sheetPath = join(outDir, `${pattern}_32.png`);
  await base.composite(overlays).toFile(sheetPath);
  return { sheetPath, count: overlays.length };
}

// ────────────────────────────────────────────────────────────────────────────
// DEBUG: Single-tile generation + auto-stitch
// ────────────────────────────────────────────────────────────────────────────
/** POST /tilesets/:slug/tile/:key
 * body: {
 *   prompt: string; pattern?: string; tileName?: string; material?: string;
 *   size?: "1024x1024"|"1024x1536"|"1536x1024"|"auto"
 * }
 * writes 32×32 → assets/tilesets/<slug>/tiles/<pattern>_<key>.png
 * ALSO stitches <pattern>_32.png and returns sheetUrl
 */
tilesetDebug.post("/tilesets/:slug/tile/:key", async (req: Request, res: Response) => {
  try {
    const { slug, key } = req.params as { slug: string; key: string };
    const { prompt, pattern: bodyPattern, tileName, material, size = "1024x1024" } = (req.body ?? {});
    const userPrompt: string = typeof prompt === "string" ? prompt : "";
    log.info({ slug, key, bodyPattern, hasPrompt: userPrompt.trim().length > 0, hasTileName: !!tileName, size }, "tile_generate_request");
    if (!SAFE_SEGMENT.test(slug)) {
      log.warn({ slug }, "tile_generate_bad_slug");
      return res.status(400).json({ ok: false, error: "bad_slug" });
    }
    if (!key || !SAFE_SEGMENT.test(key)) {
      log.warn({ key }, "tile_generate_bad_key");
      return res.status(400).json({ ok: false, error: "bad_key" });
    }

    const meta = await readMeta(slug);
    const pattern = (bodyPattern as string) || meta?.pattern || "blob47";
    if (!hasPattern(pattern)) {
      log.warn({ pattern }, "tile_generate_invalid_pattern");
      return res.status(400).json({ ok: false, error: "invalid_pattern" });
    }
    log.info({ slug, key, pattern }, "tile_generate_validated");

    const dict = await loadPatternDict(pattern, "grass");
    const tileInstruction = tileName && dict ? (dict.tiles.find(t => t.name === tileName)?.prompt ?? "") : "";

    const dir = tilesetDir(slug);
    await ensureDir(dir);
    const tilesDir = join(dir, "tiles");
    await ensureDir(tilesDir);

    const fullPrompt = composePrompt({
      preamble: dict?.global_preamble,
      tileInstruction,
      palette: meta?.palette,
      user: userPrompt,
    });
    log.debug({ slug, key, pattern, instrFound: !!tileInstruction, palette: meta?.palette ? true : false, promptSample: fullPrompt.slice(0, 120) }, "tile_prompt_composed");

    const big = await generatePortraitOpenAI({ prompt: fullPrompt, size: size as any, background: "transparent" });
    const tileBuf = await toTile32(big, 32);
    const outPath = join(tilesDir, `${pattern}_${key}.png`);
    await fs.writeFile(outPath, tileBuf);

    // Auto-stitch after each tile
    const stitched = await stitchSheetSimpleByPattern(dir, pattern, 32);

    log.info(
      {
        slug, pattern, key, tileName,
        instrFound: !!tileInstruction,
        promptSample: fullPrompt.slice(0, 200),
        stitchedCount: stitched.count
      },
      "tile_generated_and_stitched"
    );

    return res.json({
      ok: true,
      key,
      pattern,
      outPath,
      url: `/tilesets/${encodeURIComponent(slug)}/files/tiles/${encodeURIComponent(pattern)}_${encodeURIComponent(key)}.png`,
      sheetUrl: `/tilesets/${encodeURIComponent(slug)}/files/${encodeURIComponent(pattern)}_32.png`
    });
  } catch (e: any) {
    log.error({ err: e }, "tile_generate_failed");
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/** POST /tilesets/:slug/crop
 * body: { pattern: string; key: string; x:number; y:number; w:number; h:number }
 */
tilesetDebug.post("/tilesets/:slug/crop", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    const { pattern, key, x, y, w, h } = (req.body ?? {});
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    if (!pattern || !hasPattern(pattern)) return res.status(400).json({ ok: false, error: "invalid_pattern" });
    if (!key || !SAFE_SEGMENT.test(key)) return res.status(400).json({ ok: false, error: "bad_key" });

    const dir = tilesetDir(slug);
    const fp = join(dir, "tiles", `${pattern}_${key}.png`);
    await fs.access(fp).catch(() => { throw Object.assign(new Error("tile_not_found"), { status: 404 }); });

    const buf = await sharp(fp)
      .extract({ left: Number(x) || 0, top: Number(y) || 0, width: Math.max(1, Number(w) || 32), height: Math.max(1, Number(h) || 32) })
      .resize(32, 32, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    await fs.writeFile(fp, buf);

    // Stitch after crop as well, to keep sheet fresh
    const stitched = await stitchSheetSimpleByPattern(dir, pattern, 32);

    return res.json({
      ok: true,
      url: `/tilesets/${encodeURIComponent(slug)}/files/tiles/${encodeURIComponent(pattern)}_${encodeURIComponent(key)}.png`,
      sheetUrl: `/tilesets/${encodeURIComponent(slug)}/files/${encodeURIComponent(pattern)}_32.png`,
      stitchedCount: stitched.count
    });
  } catch (e: any) {
    log.error({ err: e }, "crop_failed");
    return res.status(e?.status ?? 500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

/** POST /tilesets/:slug/stitch
 * body: { pattern?: string }
 */
tilesetDebug.post("/tilesets/:slug/stitch", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });

    const meta = await readMeta(slug);
    const pattern = (req.body?.pattern as string) || meta?.pattern || "blob47";
    if (!hasPattern(pattern)) return res.status(400).json({ ok: false, error: "invalid_pattern" });

    const dir = tilesetDir(slug);
    await ensureDir(dir);
    const result = await stitchSheetSimpleByPattern(dir, pattern, 32);

    return res.json({
      ok: true,
      ...result,
      sheetUrl: `/tilesets/${encodeURIComponent(slug)}/files/${encodeURIComponent(pattern)}_32.png`
    });
  } catch (e: any) {
    log.error({ err: e }, "stitch_failed");
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});
