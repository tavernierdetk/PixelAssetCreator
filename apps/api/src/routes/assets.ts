import { Router, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { charDir } from "@pixelart/config";

export const assets = Router();

assets.get("/characters/:slug/assets", async (req: Request, res: Response) => {
  const dir = charDir(req.params.slug);
  try {
    const files = await fs.readdir(dir);
    res.json({ ok: true, files });
  } catch {
    res.status(404).json({ ok: false, error: "Character not found" });
  }
});
