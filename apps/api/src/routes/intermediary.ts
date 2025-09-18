// apps/api/src/routes/intermediary.ts
import { Router, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import os from "node:os";

import { writeFile } from "node:fs/promises";

import {
  convertCharIntermediaryToUlpc,
} from "@pixelart/intermediary-converter";
import { composeULPC } from "@pixelart/sprite-compose";
import { ensureDir, charDir } from "@pixelart/config";

// ✅ import the category reference from the package (no brittle paths)
import { ulpc as schemasUlpc } from "@pixelart/schemas";

export const intermediaryRouter: import("express").Router = Router();

intermediaryRouter.post(
  "/assistant/convert-intermediary",
  async (req: Request, res: Response) => {
    try {
      const { intermediary, animations, compose, slug, outPath } = req.body ?? {};
      if (!intermediary || typeof intermediary !== "object") {
        return res.status(400).json({ ok: false, code: "BAD_REQUEST", message: "intermediary required" });
      }

      const categoryReference = (schemasUlpc as any)?.category_reference;
      if (!categoryReference) {
        return res.status(500).json({
          ok: false,
          code: "MISSING_CATEGORY_REFERENCE_EXPORT",
          message: "Expected @pixelart/schemas.ulpc.category_reference",
        });
      }

      const result = await convertCharIntermediaryToUlpc(intermediary, {
        categoryReference,
        animations: Array.isArray(animations) && animations.length ? animations : undefined,
        loggerName: "api:intermediary",
      });

      if (!result || typeof result !== "object" || (result as any).ok !== true) {
        return res.status(400).json(result);
      }
      const okResult = result as { ok: true; build: any; trace: any[]; warnings?: any[] };

      if (!compose) {
        return res.json(okResult);
      }

      // ---- Compose path resolution ----
      let finalOutPath: string;
      if (typeof outPath === "string" && outPath.length) {
        try {
          await (ensureDir?.(dirname(outPath)) as Promise<void> | undefined);
        } catch {
          await mkdir(dirname(outPath), { recursive: true });
        }
        finalOutPath = outPath;
      } else if (typeof slug === "string" && slug.length && process.env.ASSET_ROOT) {
        const base = typeof charDir === "function"
          ? (charDir as (s: string) => string)(slug)
          : join(process.env.ASSET_ROOT!, slug);
        const dir = join(base, "preview");
        try {
          await (ensureDir?.(dir) as Promise<void> | undefined);
        } catch {
          await mkdir(dir, { recursive: true });
        }
        finalOutPath = join(dir, `ulpc_${Date.now()}.png`);
      } else {
        const dir = join(os.tmpdir(), "pixelart-preview");
        await mkdir(dir, { recursive: true });
        finalOutPath = join(dir, `ulpc_${Date.now()}.png`);
      }

      const composed = await composeULPC(okResult.build as any, finalOutPath);

      return res.json({ ...okResult, composed });
    } catch (err: any) {
      console.error("[convert-intermediary] unexpected error:", err);
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "convert_intermediary_error",
      });
    }
  }
);
