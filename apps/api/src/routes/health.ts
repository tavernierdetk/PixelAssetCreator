import { Router, type Request, type Response } from "express";
import { Redis } from "ioredis";
import { ASSET_ROOT, ensureDir } from "@pixelart/config";
import { promises as fs } from "node:fs";
import { join } from "node:path";

export const health = Router();

health.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now() });
});

health.get("/readyz", async (_req: Request, res: Response) => {
  const status: any = { ok: true, checks: {} };

  // Redis
  try {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    await redis.ping();
    await redis.quit();
    status.checks.redis = "ok";
  } catch (e: any) {
    status.ok = false;
    status.checks.redis = `error: ${e?.message ?? e}`;
  }

  // Filesystem write to ASSET_ROOT
  try {
    const probeDir = join(ASSET_ROOT, ".probe");
    await ensureDir(probeDir);
    const probeFile = join(probeDir, `ready-${Date.now()}.txt`);
    await fs.writeFile(probeFile, "ok", "utf8");
    await fs.rm(probeFile);
    status.checks.assetRoot = { ok: true, path: ASSET_ROOT };
  } catch (e: any) {
    status.ok = false;
    status.checks.assetRoot = `error: ${e?.message ?? e}`;
  }

  const code = status.ok ? 200 : 503;
  res.status(code).json(status);
});
