// apps/api/src/routes/scenes.ts
import { Router, type Request, type Response } from "express";
import path, { join, resolve } from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { createLogger } from "@pixelart/log";
import { generateImage, type OpenAIImageSize } from "@pixelart/adapters";
import { ensureDir, readProjectSettings, sceneAssetsDir } from "@pixelart/config";

const log = createLogger("@api/scenes");

export const scenes: import("express").Router = Router();

const SAFE_SEGMENT = /^[a-z0-9._-]+$/i;

function sanitizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function mapSize(size?: string): OpenAIImageSize {
  const allowed = new Set([
    "256x256","512x512","1024x1024","1536x1024","1024x1536","1792x1024","1024x1792","auto",
  ]);
  const k = String(size || "1024x1024").toLowerCase();
  return (allowed.has(k) ? (k as OpenAIImageSize) : "1024x1024");
}

function composeScenePrompt({
  aesthetics,
  promptDefaults,
  description,
}: {
  aesthetics?: string;
  promptDefaults?: { style?: string; units?: string; alpha?: string; output?: string };
  description: string;
}): string {
  const parts: string[] = [];
  const oneline = (x?: string) => String(x ?? "").replace(/\s+/g, " ").trim();
  const push = (label: string, val?: string) => { const v = oneline(val); if (v) parts.push(`[${label}] ${v}`); };
  push("STYLE", promptDefaults?.style);
  push("AESTHETICS", aesthetics);
  push("UNITS", promptDefaults?.units);
  push("ALPHA", promptDefaults?.alpha || "Canvas must have an alpha channel. No halos; crisp pixels." );
  push("SCENE", oneline(description));
  push("OUTPUT", promptDefaults?.output || "Single PNG, top-down; no watermark; game-ready.");
  push("CONSTRAINTS", "Transparent background. Fill subject area with on-palette pixels; avoid off-palette AA/gradients.");
  return parts.join("\n\n");
}

// POST /scene-assets/generate
// body: { name: string; category?: string; description: string; size?: OpenAIImageSize }
scenes.post("/scene-assets/generate", async (req: Request, res: Response) => {
  try {
    const { name, category, description, size } = (req.body ?? {}) as {
      name?: string;
      category?: string;
      description?: string;
      size?: string;
    };
    if (!description || typeof description !== "string") return res.status(400).json({ ok: false, error: "description_required" });
    const safeName = sanitizeName(name || description.slice(0, 48));
    const safeCat = category ? sanitizeName(category) : undefined;
    if (safeCat && !SAFE_SEGMENT.test(safeCat)) return res.status(400).json({ ok: false, error: "bad_category" });

    const proj = (await readProjectSettings()) as any;
    const imgCfg = proj?.images ?? {};
    const provider = (imgCfg.provider as string) || "openai";
    const model = (imgCfg.model as string) || undefined;
    const quality = (imgCfg.quality as string) || "low";
    const defaultBg = (imgCfg.backgroundDefault as string) || "transparent";
    const sizeStr = mapSize(size);

    const prompt = composeScenePrompt({ aesthetics: proj?.aesthetics, promptDefaults: proj?.promptDefaults, description });
    log.info({ provider, model, sizeStr, quality, bg: defaultBg, safeName, safeCat }, "scene.generate.request");

    const buf = await generateImage({
      provider: provider as any,
      prompt,
      size: sizeStr,
      background: provider === "openai" ? "transparent" : undefined,
      quality: quality as any,
      model: provider === "openai" ? model : (imgCfg.sd?.model && imgCfg.sd.model.trim() ? imgCfg.sd.model : undefined),
      openaiApiKey: (imgCfg.apiKey as string) || (proj as any)?.openai_api_key || process.env.OPENAI_API_KEY,
      sd: provider === "sd" ? { baseURL: imgCfg.sd?.baseURL, sampler: imgCfg.sd?.sampler, steps: imgCfg.sd?.steps, cfgScale: imgCfg.sd?.cfgScale, negativePrompt: imgCfg.sd?.negativePrompt, tiling: imgCfg.sd?.tiling, timeoutMs: imgCfg.sd?.timeoutMs } : undefined,
    });

    // Ensure RGBA output (preserve alpha if present)
    const png = await sharp(buf).png().toBuffer();

    const dir = sceneAssetsDir(safeCat);
    await ensureDir(dir);
    const outName = `${safeName || "scene"}_${Date.now()}.png`;
    const abs = join(dir, outName);
    await fs.writeFile(abs, png);

    const relParts = safeCat ? [safeCat, outName] : [outName];
    const rel = relParts.join("/");
    return res.json({ ok: true, file: rel, url: `/scene-assets/files/${relParts.map(encodeURIComponent).join("/")}` });
  } catch (e: any) {
    log.error({ err: e }, "scene.generate.failed");
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// GET /scene-assets/files/*
scenes.get("/scene-assets/files/*", async (req: Request, res: Response) => {
  try {
    const rel = (req.params as any)[0] as string;
    const segments = (rel ?? "").split("/").filter(Boolean);
    if (!segments.length || !segments.every((s: string) => SAFE_SEGMENT.test(s))) {
      return res.status(400).end("Bad filename");
    }
    const filePath = join(sceneAssetsDir(segments.length > 1 ? segments[0] : undefined), ...(segments.length > 1 ? segments.slice(1) : segments));
    await fs.access(filePath).catch(() => { throw Object.assign(new Error("Not found"), { status: 404 }); });
    res.sendFile(path.resolve(filePath));
  } catch (e: any) {
    return res.status(e?.status ?? 500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// GET /scene-assets/list?category=...
scenes.get("/scene-assets/list", async (req: Request, res: Response) => {
  try {
    const cat = typeof req.query.category === "string" && req.query.category ? sanitizeName(req.query.category) : undefined;
    const base = sceneAssetsDir(cat);
    await ensureDir(base);
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    const files = entries.filter(e => e.isFile() && /\.(png|webp|json)$/i.test(e.name)).map(e => (cat ? `${cat}/${e.name}` : e.name)).sort();
    return res.json({ ok: true, files });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});
