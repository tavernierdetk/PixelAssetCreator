import { Router, type Request, type Response } from "express";
import * as schemas from "@pixelart/schemas";
import { writeLiteDef, readLiteDef } from "@pixelart/config";

const validateCharacterLite =
  (schemas as any).default?.validateCharacterLite ??
  (schemas as any).validateCharacterLite;

const slugRe = /^[a-z0-9_]+$/;
const toSlug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
  `char_${Math.floor(Math.random() * 1e6).toString().padStart(6, "0")}`;

export const intake = Router();

intake.post("/intake/commit", async (req: Request, res: Response) => {
  const payload = { ...(req.body ?? {}) };
  const name = payload?.identity?.char_name ?? "Unnamed";
  const providedSlug = payload?.identity?.char_slug as string | undefined;
  const slug = providedSlug && slugRe.test(providedSlug) ? providedSlug : toSlug(name);
  payload.identity = { ...(payload.identity ?? {}), char_name: name, char_slug: slug };

  const ok = validateCharacterLite(payload);
  if (!ok) return res.status(400).json({ ok: false, slug, errors: validateCharacterLite.errors });

  const file = await writeLiteDef(slug, payload);
  return res.status(201).json({ ok: true, slug, file });
});

intake.get("/characters/:slug/defs/lite", async (req: Request, res: Response) => {
  try {
    const json = await readLiteDef(req.params.slug);
    return res.json(json);
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message ?? "Not found" });
  }
});
