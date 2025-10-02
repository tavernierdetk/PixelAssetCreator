// apps/api/src/routes/tilesets.ts
import { Router, type Request, type Response, type Express } from "express";
import { promises as fs } from "node:fs";
import path, { join, resolve } from "node:path";
import { Queue } from "bullmq";
import sharp from "sharp";

// Safe fallbacks for config helpers
import * as config from "@pixelart/config";
import { createLogger } from "@pixelart/log";
import { generateImage } from "@pixelart/adapters";
import { listPatterns, hasPattern, PATTERNS } from "@pixelart/tileset-compose";
import multer from "multer";
import { writeTileSetTres, deriveCoast16Rules } from "@pixelart/godot-res";
import { readProjectSettings } from "@pixelart/config";

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

function textureFileForSlot(slot: string): { file: string; metaKey: "materialA"|"materialB"|"transition" } | null {
  const s = String(slot || "").toLowerCase();
  if (s === "a" || s === "texturea" || s === "texture_a" || s === "materiala" || s === "material_a") return { file: "materialA.png", metaKey: "materialA" };
  if (s === "b" || s === "textureb" || s === "texture_b" || s === "materialb" || s === "material_b") return { file: "materialB.png", metaKey: "materialB" };
  if (s === "transition" || s === "blend" || s === "mask") return { file: "transition.png", metaKey: "transition" };
  return null;
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
    if (pattern === "coast16") {
      const rel = "../../../../packages/tileset-compose/prompts/coast16_ab.json";
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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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
// PROD: Export tileset to Godot 4 TileSet resource (v1: coast16 only, meta sidecar)
// POST /tilesets/:slug/export-godot
// body: {}
// ────────────────────────────────────────────────────────────────────────────
tilesets.post("/tilesets/:slug/export-godot", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const debug = String((req.query as any)?.debug ?? "").trim() === "1" || (req.body?.debug === true);

    const baseDir = tilesetDir(slug);
    await ensureDir(baseDir);
    const meta = await readMeta(slug);
    const pattern = meta?.pattern ?? "coast16";
    if (pattern !== "coast16") {
      return res.status(501).json({ ok: false, error: "export_only_supports_coast16_v1" });
    }

    // 1) Discover manifest and stitched sheet
    const manifestCandidates = [join(baseDir, "coast16_manifest.json")];
    let manifest: any | null = null;
    for (const fp of manifestCandidates) {
      try { const txt = await fs.readFile(fp, "utf8"); manifest = JSON.parse(txt); break; } catch {}
    }
    // Fallback: try to read any *manifest*.json and filter engine_order
    if (!manifest) {
      try {
        const names = await fs.readdir(baseDir).catch(() => []);
        const manifestName = names.find((n) => /manifest\.json$/i.test(n));
        if (manifestName) {
          const txt = await fs.readFile(join(baseDir, manifestName), "utf8");
          const j = JSON.parse(txt);
          if (j?.engine_order === "coast16") manifest = j;
        }
      } catch {}
    }

    // Sheet file
    let sheetName: string | null = null;
    if (manifest?.sheet?.file && typeof manifest.sheet.file === "string") sheetName = manifest.sheet.file;
    if (!sheetName) {
      const names = await fs.readdir(baseDir).catch(() => []);
      sheetName = names.find((n) => /^coast16_\d+\.png$/i.test(n)) || null;
    }
    if (!sheetName) {
      if (debug) log.warn({ slug, baseDir }, "export_godot_sheet_not_found");
      return res.status(404).json({ ok: false, error: "sheet_not_found" });
    }

    const grid = manifest?.grid ?? { cols: 4, rows: 4, tile: 32 };
    const tileSize = Number(grid?.tile ?? 32) || 32;

    // 2) Build rules (file or derive)
    const rulesPath = join(baseDir, "godot_rules.json");
    let rules: any | null = null;
    try { const txt = await fs.readFile(rulesPath, "utf8"); rules = JSON.parse(txt); } catch {}

    let rulesSource: "file" | "derived" = "file";
    if (!rules) {
      // Derive coast16 from manifest tiles (id, name)
      if (!manifest || !Array.isArray(manifest?.tiles)) return res.status(404).json({ ok: false, error: "manifest_missing_for_derivation" });
      const tilesByIndex = (manifest.tiles as any[])
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        .slice(0, grid.cols * grid.rows)
        .map((t) => ({ id: Number(t.id ?? 0), name: String(t.name ?? "") }));
      const materialsAB = meta?.materials_ab ?? undefined;
      rules = deriveCoast16Rules({ name: slug, tileSize, grid: { cols: grid.cols, rows: grid.rows }, tilesByIndex, materialsAB });
      rulesSource = "derived";
    }

    // 3) Prepare out paths and atlas naming (reuse if includes slug; else slugged copy)
    const godotDir = join(baseDir, "godot");
    await ensureDir(godotDir);

    const sheetIncludesSlug = sheetName.toLowerCase().includes(slug.toLowerCase());
    const atlasTargetName = sheetIncludesSlug ? sheetName : `${slug}_${sheetName}`;
    if (!sheetIncludesSlug) {
      // copy into godot subfolder; keep original intact
      await fs.copyFile(join(baseDir, sheetName), join(godotDir, atlasTargetName));
    } else {
      // ensure a copy exists in godot folder using the same name
      try { await fs.copyFile(join(baseDir, sheetName), join(godotDir, atlasTargetName)); } catch {}
    }

    // 4) Write .tres (ext resource path targets project layout)
    const extResPath = `res://Assets/Tilesets/${slug}/${atlasTargetName}`;
    const tresPath = await writeTileSetTres({ outDir: godotDir, atlasPngName: atlasTargetName, extResourcePath: extResPath, rules });

    // 5) Sidecar meta
    const sidecar = {
      schema: "tileset.godot-meta/1.0",
      slug,
      pattern,
      tileSize,
      grid: { cols: grid.cols, rows: grid.rows },
      rulesSource,
      materials_ab: meta?.materials_ab ?? null,
      atlasFile: atlasTargetName,
      generated_at: new Date().toISOString(),
    };
    await fs.writeFile(join(godotDir, "tileset.meta.json"), JSON.stringify(sidecar, null, 2), "utf8");

    // 6) Mirror to project if available
    async function discoverGodotProjectRoot(): Promise<string | null> {
      const env = typeof process.env.GODOT_PROJECT_ROOT === "string" ? process.env.GODOT_PROJECT_ROOT : null;
      if (env && env.trim().length) return env;
      const settings = await readProjectSettings().catch(() => ({}));
      const fromSettings = (settings as any)?.godot_project_root;
      if (typeof fromSettings === "string" && fromSettings.trim().length > 0) return fromSettings;
      return null;
    }
    const projectRoot = await discoverGodotProjectRoot();
    let projectDir: string | null = null;
    if (projectRoot) {
      projectDir = join(projectRoot, "Assets", "Tilesets", slug);
      await ensureDir(projectDir);
      await fs.copyFile(join(godotDir, atlasTargetName), join(projectDir, atlasTargetName)).catch(() => {});
      await fs.copyFile(tresPath, join(projectDir, "tileset.tres"));
    }

    if (debug) {
      const lines = [
        `slug=${slug}`,
        `pattern=${pattern}`,
        `sheetName=${sheetName}`,
        `atlasTargetName=${atlasTargetName}`,
        `grid=${JSON.stringify({ cols: grid.cols, rows: grid.rows, tile: tileSize })}`,
        `rulesSource=${rulesSource}`,
        `localDir=${godotDir}`,
        `projectDir=${projectDir ?? ""}`,
      ];
      try { await fs.writeFile(join(godotDir, "export_debug.log"), lines.join("\n"), "utf8"); } catch {}
    }

    return res.json({ ok: true, localDir: godotDir, projectDir, atlas: atlasTargetName, tres: "tileset.tres", rulesSource });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: Procedural generate for Coast16
// POST /tilesets/:slug/procedural/generate
// body: { tileSize?, bandWidth?, cornerStyle?, transitionMode?, textureScale? }
// Enqueues a tileset job with mode = procedural
// ────────────────────────────────────────────────────────────────────────────
tilesets.post("/tilesets/:slug/procedural/generate", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const body = req.body || {};

    await ensureDir(tilesetDir(slug));
    const meta = await readMeta(slug);
    {
      // Merge pattern + procedural_settings into meta for persistence
      const prev = meta || {};
      const ps = {
        ...(prev?.procedural_settings || {}),
        ...(typeof body.tileSize === "number" ? { tileSize: body.tileSize } : {}),
        ...(typeof body.bandWidth === "number" ? { bandWidth: body.bandWidth } : {}),
        ...(typeof body.cornerStyle === "string" ? { cornerStyle: body.cornerStyle } : {}),
        ...(typeof body.transitionMode === "string" ? { transitionMode: body.transitionMode } : {}),
        ...(typeof body.textureScale === "number" ? { textureScale: body.textureScale } : {}),
        ...(typeof body.lineStyle === "string" ? { lineStyle: body.lineStyle } : {}),
      } as any;
      const next = { ...(prev || {}), pattern: prev.pattern || "coast16", tile_size: prev.tile_size || 32, procedural_settings: ps };
      await writeMeta(slug, next);
    }

    const job = await tilesetQ.add(
      "generate",
      {
        slug,
        pattern: "coast16",
        mode: "procedural",
        proceduralSettings: {
          tileSize: typeof body.tileSize === "number" ? body.tileSize : undefined,
          bandWidth: typeof body.bandWidth === "number" ? body.bandWidth : undefined,
          cornerStyle: typeof body.cornerStyle === "string" ? body.cornerStyle : undefined,
          transitionMode: typeof body.transitionMode === "string" ? body.transitionMode : undefined,
          textureScale: typeof body.textureScale === "number" ? body.textureScale : undefined,
          lineStyle: typeof body.lineStyle === "string" ? body.lineStyle : undefined,
        },
      },
      { removeOnComplete: { age: 120, count: 1000 } as any, removeOnFail: 25 }
    );
    return res.json({ ok: true, jobId: job.id });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: Delete a tileset (dangerous — removes its folder under assets/tilesets)
// DELETE /tilesets/:slug
// ────────────────────────────────────────────────────────────────────────────
tilesets.delete("/tilesets/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const dir = tilesetDir(slug);
    await fs.rm(dir, { recursive: true, force: true } as any).catch((e) => {
      if (e && (e as any).code !== "ENOENT") throw e;
    });
    return res.json({ ok: true, deleted: slug });
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

// PUT /tilesets/:slug/meta — update v2 fields
tilesets.put("/tilesets/:slug/meta", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const prev = (await readMeta(slug)) || {};
    const body = req.body ?? {};
    // Optional: allow setting immutable pattern at creation time (or keep existing)
    let nextPattern = prev.pattern || undefined;
    if (typeof body.pattern === "string" && hasPattern(body.pattern)) {
      nextPattern = body.pattern;
    }
    const next = {
      ...prev,
      schema: "tileset.meta/2.0",
      slug: prev.slug || slug,
       // persist pattern + tile_size if provided (or keep previous/default)
      ...(nextPattern ? { pattern: nextPattern, tile_size: (PATTERNS as any)[nextPattern]?.tileSize ?? prev.tile_size ?? 32 } : {}),
      materials_text: typeof body.materials_text === "string" ? body.materials_text : prev.materials_text || "",
      palette_text: typeof body.palette_text === "string" ? body.palette_text : prev.palette_text || "",
      interface_text: typeof body.interface_text === "string" ? body.interface_text : prev.interface_text || "",
      materials_ab: (() => {
        const ab = body.materials_ab;
        const Aname = body.materialA ?? ab?.A?.name;
        const Bname = body.materialB ?? ab?.B?.name;
        const Avec = Array.isArray(body.vehiclesA) ? body.vehiclesA : (Array.isArray(ab?.A?.vehicles) ? ab.A.vehicles : undefined);
        const Bvec = Array.isArray(body.vehiclesB) ? body.vehiclesB : (Array.isArray(ab?.B?.vehicles) ? ab.B.vehicles : undefined);
        if (!Aname && !Bname && !Avec && !Bvec) return prev.materials_ab || undefined;
        return {
          A: { name: Aname || prev?.materials_ab?.A?.name || "Land", vehicles: (Avec ?? prev?.materials_ab?.A?.vehicles ?? []).filter(Boolean) },
          B: { name: Bname || prev?.materials_ab?.B?.name || "Water", vehicles: (Bvec ?? prev?.materials_ab?.B?.vehicles ?? []).filter(Boolean) },
        };
      })(),
    };
    await writeMeta(slug, next);
    return res.json({ ok: true, meta: next });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PROD: Enqueue job (immutable pattern per slug)
// POST /tilesets/:slug/enqueue
// body: { pattern: string; mode?: "direct"|"mask"; paletteName?: string; material?: string }
// ────────────────────────────────────────────────────────────────────────────
tilesets.post("/tilesets/:slug/enqueue", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });

    const { pattern, mode = "direct", paletteName = "roman_steampunk", material } = (req.body ?? {});
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
      } as any;
      await writeMeta(slug, meta);
    } else if (existing.pattern && existing.pattern !== pattern) {
      return res.status(409).json({ ok: false, reason: "pattern_mismatch", have: existing.pattern, want: pattern });
    }

    const job = await tilesetQ.add(
      "generate",
      { slug, pattern, mode, paletteName, ...(material ? { material } : {}) },
      { removeOnComplete: { age: 120, count: 1000 } as any, removeOnFail: 25 }
    );
    // Append a simple debug line to slug folder
    try {
      const line = `${new Date().toISOString()} enqueue pattern=${pattern} mode=${mode} palette=${paletteName} job=${job.id}\n`;
      await fs.appendFile(join(tilesetDir(slug), "debug.log"), line, "utf8");
    } catch {}
    return res.json({ ok: true, jobId: job.id });
  } catch (e: any) {
    try {
      const slug = (req.params as any)?.slug;
      if (slug && SAFE_SEGMENT.test(slug)) {
        const line = `${new Date().toISOString()} enqueue_error ${String(e?.message ?? e)}\n`;
        await fs.appendFile(join(tilesetDir(slug), "debug.log"), line, "utf8");
      }
    } catch {}
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
    if (!/\.(png|webp|json|log|txt)$/i.test(leaf)) return res.status(403).end("Forbidden");

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
// PROD: Textures (A, B, transition) upload/delete/generate
// ────────────────────────────────────────────────────────────────────────────
tilesets.post(
  "/tilesets/:slug/textures/upload",
  upload.single("file"),
  async (req: Request & { file?: Express.Multer.File }, res: Response) => {
    try {
      const { slug } = req.params as { slug: string };
      if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
      const slot = (req.query.slot as string) || "A";
      const map = textureFileForSlot(slot);
      if (!map) return res.status(400).json({ ok: false, error: "invalid_slot" });
      if (!req.file) return res.status(400).json({ ok: false, error: "no_file" });
      if (!/^image\//i.test(req.file.mimetype)) return res.status(400).json({ ok: false, error: "bad_mime" });
      const dir = join(tilesetDir(slug), "procedural");
      await ensureDir(dir);
      const rel = `procedural/${map.file}`;
      await fs.writeFile(join(dir, map.file), req.file.buffer);
      // update meta
      const prev = (await readMeta(slug)) || {};
      const next = { ...(prev || {}), procedural_textures: { ...(prev?.procedural_textures || {}), [map.metaKey]: rel } } as any;
      await writeMeta(slug, next);
      return res.json({ ok: true, file: rel, meta: next.procedural_textures });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  }
);

tilesets.delete("/tilesets/:slug/textures", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const slot = (req.query.slot as string) || "A";
    const map = textureFileForSlot(slot);
    if (!map) return res.status(400).json({ ok: false, error: "invalid_slot" });
    const abs = join(tilesetDir(slug), "procedural", map.file);
    await fs.unlink(abs).catch(() => {});
    // update meta: remove the entry
    const prev = (await readMeta(slug)) || {};
    const pt = { ...(prev?.procedural_textures || {}) } as any;
    delete pt[map.metaKey];
    const next = { ...(prev || {}), procedural_textures: pt } as any;
    await writeMeta(slug, next);
    return res.json({ ok: true, deleted: `procedural/${map.file}`, meta: next.procedural_textures });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

tilesets.post("/tilesets/:slug/textures/generate", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    if (!SAFE_SEGMENT.test(slug)) return res.status(400).json({ ok: false, error: "bad_slug" });
    const slot = (req.query.slot as string) || "A";
    const map = textureFileForSlot(slot);
    if (!map) return res.status(400).json({ ok: false, error: "invalid_slot" });
    const dir = join(tilesetDir(slug), "procedural");
    await ensureDir(dir);
    const color = (() => {
      const s = String(slot).toLowerCase();
      if (s.startsWith("a")) return { r: 90, g: 160, b: 90, alpha: 1 };
      if (s.startsWith("b")) return { r: 70, g: 120, b: 200, alpha: 1 };
      return { r: 128, g: 128, b: 128, alpha: 1 };
    })();
    const buf = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: color } }).png().toBuffer();
    await fs.writeFile(join(dir, map.file), buf);
    const rel = `procedural/${map.file}`;
    const prev = (await readMeta(slug)) || {};
    const next = { ...(prev || {}), procedural_textures: { ...(prev?.procedural_textures || {}), [map.metaKey]: rel } } as any;
    await writeMeta(slug, next);
    return res.json({ ok: true, file: rel, meta: next.procedural_textures });
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

// v2 prompt composer — no legacy fallback
type PromptV2 = {
  style?: string;
  tileability?: string;
  units?: string;
  alpha?: string;
  output?: string;
  materials?: string;
  traversal?: string;
  palette?: string;
  interface?: string;
  slot?: string;
  hint?: string; // optional freeform addendum after [OUTPUT]
};
function composePromptV2(p: PromptV2): string {
  const lines: string[] = [];
  const push = (label: string, value?: string) => {
    const v = oneline(value || "");
    if (v) lines.push(`[${label}] ${v}`);
  };
  push("STYLE", p.style);
  push("TILEABILITY", p.tileability);
  push("UNITS", p.units);
  push("MATERIALS", p.materials);
  push("TRAVERSAL", p.traversal);
  push("PALETTE", p.palette);
  push("ALPHA", p.alpha);
  push("INTERFACE", p.interface);
  push("SLOT", p.slot);
  push("OUTPUT", p.output);
  // Strong constraints to avoid missing pixels and enforce palette usage
  push(
    "CONSTRAINTS",
    "Fill the entire canvas; no blank or transparent pixels anywhere. Every output pixel must be strictly from the [PALETTE] set — no off-palette colors, no anti-aliasing, no gradients, no halos."
  );
  if (p.hint && p.hint.trim()) lines.push(p.hint.trim());
  return lines.join("\n\n");
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
        const fp = join(tilesDir, name);
        try {
          const md = await sharp(fp).metadata();
          if ((md?.width ?? tileSize) !== tileSize || (md?.height ?? tileSize) !== tileSize) {
            const resized = await sharp(fp).ensureAlpha().resize(tileSize, tileSize, { kernel: sharp.kernel.nearest, fit: "fill" }).png().toBuffer();
            overlays.push({ input: resized, left: c * tileSize, top: r * tileSize });
          } else {
            overlays.push({ input: fp, left: c * tileSize, top: r * tileSize });
          }
        } catch {
          const resized = await sharp(fp).ensureAlpha().resize(tileSize, tileSize, { kernel: sharp.kernel.nearest, fit: "fill" }).png().toBuffer();
          overlays.push({ input: resized, left: c * tileSize, top: r * tileSize });
        }
        occupied[r][c] = true;
        continue;
      }
    }
    fallback.push(name);
  }

  outer: for (const name of fallback) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!occupied[r][c]) {
        const fp = join(tilesDir, name);
        try {
          const md = await sharp(fp).metadata();
          if ((md?.width ?? tileSize) !== tileSize || (md?.height ?? tileSize) !== tileSize) {
            const resized = await sharp(fp).ensureAlpha().resize(tileSize, tileSize, { kernel: sharp.kernel.nearest, fit: "fill" }).png().toBuffer();
            overlays.push({ input: resized, left: c * tileSize, top: r * tileSize });
          } else {
            overlays.push({ input: fp, left: c * tileSize, top: r * tileSize });
          }
        } catch {
          const resized = await sharp(fp).ensureAlpha().resize(tileSize, tileSize, { kernel: sharp.kernel.nearest, fit: "fill" }).png().toBuffer();
          overlays.push({ input: resized, left: c * tileSize, top: r * tileSize });
        }
        occupied[r][c] = true;
        continue outer;
      }
    }
  }

  const sheetPath = join(outDir, `${pattern}_32.png`);
  // Normalize all overlays to buffers and composite in a single call
  const prepared: sharp.OverlayOptions[] = [];
  for (const ov of overlays) {
    let buf: Buffer;
    try {
      const md = await sharp(ov.input as any).metadata();
      if ((md.width ?? tileSize) !== tileSize || (md.height ?? tileSize) !== tileSize) {
        buf = await sharp(ov.input as any).ensureAlpha().resize(tileSize, tileSize, { kernel: sharp.kernel.nearest, fit: "fill" }).png().toBuffer();
      } else {
        buf = await sharp(ov.input as any).ensureAlpha().png().toBuffer();
      }
    } catch {
      buf = await sharp(ov.input as any).ensureAlpha().resize(tileSize, tileSize, { kernel: sharp.kernel.nearest, fit: "fill" }).png().toBuffer();
    }
    prepared.push({ input: buf, left: ov.left!, top: ov.top! });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .composite(prepared)
    .toFile(sheetPath);
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
    const { prompt, fullPrompt: fullPromptOverride, pattern: bodyPattern, tileName, material, size } = (req.body ?? {});
    const userPrompt: string = typeof prompt === "string" ? prompt : "";
    const fullOverride: string = typeof fullPromptOverride === "string" ? fullPromptOverride : "";
    log.info({ slug, key, bodyPattern, hasPrompt: userPrompt.trim().length > 0, hasFullPrompt: fullOverride.trim().length > 0, hasTileName: !!tileName, size }, "tile_generate_request");
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

    // If client provided a full prompt, use it verbatim; otherwise compose v2
    let fullPrompt: string;
    if (fullOverride && fullOverride.trim().length > 0) {
      fullPrompt = String(fullOverride);
      log.info({ slug, key, pattern, mode: "direct", fullPrompt }, "tile_prompt_direct_v2");
    } else {
      const proj = (await readProjectSettings()) as any;
      const pd = proj?.promptDefaults ?? {};
      // Debug: availability of project prompt sections
      log.info({
        slug,
        key,
        pd_keys: Object.keys(pd || {}),
        have: {
          style: !!pd?.style,
          tileability: !!pd?.tileability,
          units: !!pd?.units,
          alpha: !!pd?.alpha,
          output: !!pd?.output,
        }
      }, "tile_pd_availability");
      // Derive A/B materials + traversal lines if available
      const ab = (meta as any)?.materials_ab;
      const abMaterials = ab ? `A=${ab?.A?.name || "Land"}; B=${ab?.B?.name || "Water"}.` : (meta?.materials_text ?? "");
      const travLine = ab ? `${ab?.A?.name || "A"}: ${(Array.isArray(ab?.A?.vehicles) ? ab.A.vehicles : [])?.join(", ") || "none"}; ${ab?.B?.name || "B"}: ${(Array.isArray(ab?.B?.vehicles) ? ab.B.vehicles : [])?.join(", ") || "none"}.` : "";

      fullPrompt = composePromptV2({
        style: pd.style,
        tileability: pd.tileability,
        units: pd.units,
        alpha: pd.alpha,
        output: pd.output,
        materials: abMaterials,
        traversal: travLine,
        palette: meta?.palette_text ?? "",
        interface: meta?.interface_text ?? "",
        slot: tileInstruction,
        hint: userPrompt,
      });
      // Debug: verify composed prompt includes expected tags
      const has = (tag: string) => fullPrompt.includes(`[${tag}]`);
      log.info({
        slug,
        key,
        pattern,
        mode: "composed",
        instrFound: !!tileInstruction,
        includes: {
          STYLE: has("STYLE"),
          TILEABILITY: has("TILEABILITY"),
          UNITS: has("UNITS"),
          ALPHA: has("ALPHA"),
          OUTPUT: has("OUTPUT"),
        },
        fullPrompt,
      }, "tile_prompt_composed_v2");
    }

    // Pull image generation defaults from project settings
    const proj = (await readProjectSettings()) as any;
    const imgCfg = proj?.images ?? {};
    const provider = (imgCfg.provider as string) || "openai";
    const model = (imgCfg.model as string) || undefined;
    const quality = (imgCfg.quality as string) || "low";
    const defaultBg = (imgCfg.backgroundDefault as string) || "transparent";
    const imgSize = (size as any) ?? (imgCfg.sizeDefault as string) ?? "1024x1024";
    const sdCfg = (imgCfg.sd as any) || {};
    const effectiveModel = provider === "openai" ? model : (sdCfg?.model && sdCfg.model.trim() ? sdCfg.model : undefined);

    log.info({ provider, model, effectiveModel, quality, imgSize, defaultBg, sd: sdCfg ? { baseURL: sdCfg.baseURL, model: sdCfg.model, sampler: sdCfg.sampler, steps: sdCfg.steps, cfgScale: sdCfg.cfgScale, tiling: sdCfg.tiling } : null }, "tile_image_config");

    const big = await generateImage({
      provider: provider as any,
      prompt: fullPrompt,
      size: imgSize,
      background: provider === "openai" && defaultBg === "transparent" ? "transparent" : undefined,
      quality: quality as any,
      // For SD, only pass a model if one is provided specifically for SD
      model: effectiveModel,
      openaiApiKey: (imgCfg.apiKey as string) || (proj as any)?.openai_api_key || process.env.OPENAI_API_KEY,
      sd: provider === "sd" ? {
        baseURL: sdCfg.baseURL,
        sampler: sdCfg.sampler,
        steps: sdCfg.steps,
        cfgScale: sdCfg.cfgScale,
        negativePrompt: sdCfg.negativePrompt,
        tiling: sdCfg.tiling,
        timeoutMs: sdCfg.timeoutMs,
      } : undefined,
    });
    const tileBuf = await toTile32(big, 32);
    const outPath = join(tilesDir, `${pattern}_${key}.png`);
    await fs.writeFile(outPath, tileBuf);

    // Auto-stitch after each tile
    const stitched = await stitchSheetSimpleByPattern(dir, pattern, 32);

    log.info(
      {
        slug, pattern, key, tileName,
        instrFound: !!tileInstruction,
        fullPrompt,
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
