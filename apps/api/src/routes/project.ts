import { Router, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";

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
};

async function readSettings() {
  try {
    const raw = await fs.readFile(projectSettingsPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
}
async function writeSettings(json: any) {
  await fs.mkdir(projectDir(), { recursive: true });
  await fs.writeFile(projectSettingsPath(), JSON.stringify(json, null, 2), "utf8");
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
