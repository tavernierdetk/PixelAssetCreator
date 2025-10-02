import { Router, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
import { readProjectSettings as cfgRead, writeProjectSettings as cfgWrite } from "@pixelart/config";

export const project: import("express").Router = Router();

function charactersRoot() {
  return process.env.ASSET_ROOT || resolve(process.cwd(), "..", "..", "assets", "characters");
}
function assetsRoot() {
  // parent folder of /assets/characters
  return resolve(charactersRoot(), "..");
}
function projectDir() {
  return join(assetsRoot(), "project");
}
function projectSettingsPath() {
  // Deprecated: path used by older builds. We now use @pixelart/config SETTINGS_FILE.
  return join(projectDir(), "project_settings.json");
}

const DEFAULT_SETTINGS = {
  project_name: "PixelArt Game",
  aesthetics: "",
  pixel_scale: 1,
  resolutions: {
    portrait: { width: 512, height: 512 },
    idle: { width: 64, height: 64 },
    animation_frame: { width: 64, height: 64 },
  },
  palette_path: "", // optional path under /assets (leave empty if N/A)
  // Prompt defaults (Tileset v2)
  promptDefaults: {
    style: "",
    tileability: "",
    units: "",
    alpha: "",
    output: "",
  },
  // Image generation defaults (provider/model)
  images: {
    provider: "openai", // "openai" | "stub"
    model: "gpt-image-1",
    quality: "low", // low|standard|high
    sizeDefault: "1024x1024",
    backgroundDefault: "transparent",
    sd: {
      baseURL: "http://localhost:7860",
      model: "",
      sampler: "DPM++ 2M Karras",
      steps: 20,
      cfgScale: 7,
      negativePrompt: "",
      tiling: false,
    },
  },
  // LLM settings (for chats and intermediary conversions)
  llm: {
    provider: "openai", // future: "anthropic", "azure-openai", etc.
    chatModel: "gpt-4o-mini",
    chatAssistantId: "",
    intermediaryAssistantId: "",
  },
};

async function readSettings() {
  // Prefer @pixelart/config file; fall back to deprecated file if present; else defaults
  const cfg = await cfgRead().catch(() => ({}));
  if (cfg && Object.keys(cfg).length > 0) return { ...DEFAULT_SETTINGS, ...cfg };
  try {
    const raw = await fs.readFile(projectSettingsPath(), "utf8");
    const legacy = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...legacy };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
async function writeSettings(json: any) {
  await cfgWrite(json);
}

function isSize(x: any) {
  return x && Number.isFinite(x.width) && Number.isFinite(x.height) && x.width > 0 && x.height > 0;
}
function validateSettings(s: any) {
  if (!s || typeof s !== "object") return "Invalid settings object";
  if (!("aesthetics" in s)) return "Missing aesthetics";
  if (!("resolutions" in s)) return "Missing resolutions";
  const r = s.resolutions || {};
  if (!isSize(r.portrait)) return "resolutions.portrait must be {width,height>0}";
  if (!isSize(r.idle)) return "resolutions.idle must be {width,height>0}";
  if (!isSize(r.animation_frame)) return "resolutions.animation_frame must be {width,height>0}";
  if ("pixel_scale" in s && (!Number.isInteger(s.pixel_scale) || s.pixel_scale <= 0))
    return "pixel_scale must be a positive integer";
  // Optional promptDefaults block
  if ("promptDefaults" in s) {
    const pd = s.promptDefaults;
    if (!pd || typeof pd !== "object") return "promptDefaults must be an object";
    for (const k of ["style", "tileability", "units", "alpha", "output"]) {
      if (k in pd && typeof pd[k] !== "string") return `promptDefaults.${k} must be a string`;
    }
  }
  // Optional images block
  if ("images" in s) {
    const im = s.images;
    if (!im || typeof im !== "object") return "images must be an object";
    if (im.apiKey != null && typeof im.apiKey !== "string") return "images.apiKey must be a string";
    const allowedProviders = new Set(["openai", "stub", "sd"]);
    if (im.provider && !allowedProviders.has(im.provider)) return "images.provider invalid";
    if (im.quality && !new Set(["low", "standard", "high"]).has(im.quality)) return "images.quality invalid";
    if (im.backgroundDefault && !new Set(["transparent", "opaque"]).has(im.backgroundDefault)) return "images.backgroundDefault invalid";
    const sizes = new Set(["256x256","512x512","1024x1024","1536x1024","1024x1536","1792x1024","1024x1792","auto"]);
    if (im.sizeDefault && !sizes.has(im.sizeDefault)) return "images.sizeDefault invalid";
    if (im.sd) {
      const sd = im.sd;
      if (!sd || typeof sd !== "object") return "images.sd must be an object";
      if (sd.steps != null && (!Number.isInteger(sd.steps) || sd.steps < 1 || sd.steps > 200)) return "images.sd.steps invalid";
      if (sd.cfgScale != null && (typeof sd.cfgScale !== "number" || sd.cfgScale < 1 || sd.cfgScale > 30)) return "images.sd.cfgScale invalid";
      if (sd.tiling != null && typeof sd.tiling !== "boolean") return "images.sd.tiling invalid";
      if (sd.baseURL && typeof sd.baseURL !== "string") return "images.sd.baseURL invalid";
      if (sd.sampler && typeof sd.sampler !== "string") return "images.sd.sampler invalid";
      if (sd.model && typeof sd.model !== "string") return "images.sd.model invalid";
      if (sd.negativePrompt && typeof sd.negativePrompt !== "string") return "images.sd.negativePrompt invalid";
      if (sd.timeoutMs != null && (!Number.isInteger(sd.timeoutMs) || sd.timeoutMs < 10000 || sd.timeoutMs > 3_600_000)) return "images.sd.timeoutMs invalid";
    }
  }
  // Optional llm block
  if ("llm" in s) {
    const llm = s.llm;
    if (!llm || typeof llm !== "object") return "llm must be an object";
    if (llm.apiKey != null && typeof llm.apiKey !== "string") return "llm.apiKey must be a string";
    const providers = new Set(["openai"]);
    if (llm.provider && !providers.has(llm.provider)) return "llm.provider invalid";
    if (llm.chatModel && typeof llm.chatModel !== "string") return "llm.chatModel invalid";
    if (llm.chatAssistantId && typeof llm.chatAssistantId !== "string") return "llm.chatAssistantId invalid";
    if (llm.intermediaryAssistantId && typeof llm.intermediaryAssistantId !== "string") return "llm.intermediaryAssistantId invalid";
  }
  return null;
}

// GET /project/settings → current (or defaults)
project.get("/project/settings", async (_req: Request, res: Response) => {
  try {
    const json = await readSettings();
    return res.json({ ok: true, settings: json });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// PUT /project/settings → validate & persist
project.put("/project/settings", async (req: Request, res: Response) => {
  try {
    const incoming = req.body ?? {};
    const err = validateSettings(incoming);
    if (err) return res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: err });
    await writeSettings(incoming);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});
