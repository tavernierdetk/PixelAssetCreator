// apps/api/src/routes/intermediary.ts
import { Router, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import os from "node:os";

import {
  loadCategoryReferenceFromDisk,
  convertCharIntermediaryToUlpc,
} from "@pixelart/intermediary-converter";
import { composeULPC } from "@pixelart/sprite-compose";
import { ensureDir, charDir } from "@pixelart/config";

export const intermediaryRouter: import("express").Router = Router();

/**
 * POST /assistant/convert-intermediary
 *
 * Body:
 * {
 *   intermediary: Char_Intermediary;      // required
 *   animations?: string[];                // optional, defaults to ["idle"] inside converter
 *   compose?: boolean;                    // optional, when true composes a PNG
 *   slug?: string;                        // optional; used for output path when compose=true
 *   outPath?: string;                     // optional, absolute PNG path (overrides slug)
 * }
 *
 * Env (absolute paths strongly recommended):
 *   CATEGORY_REFERENCE_FILE=/abs/path/to/packages/schemas/src/ulpc/category_reference.v1.json
 *   ULPC_SHEET_DEFS=/abs/path/to/packages/sprite-catalog/vendor/ulpc-src/sheet_definitions
 *   ASSET_ROOT=/abs/path/to/assets/characters   (only needed when compose=true and using slug)
 */
intermediaryRouter.post(
  "/assistant/convert-intermediary",
  async (req: Request, res: Response) => {
    try {
      const { intermediary, animations, compose, slug, outPath } = req.body ?? {};

      if (!intermediary || typeof intermediary !== "object") {
        return res
          .status(400)
          .json({ ok: false, code: "BAD_REQUEST", message: "intermediary required" });
      }

      // Resolve category reference path
      const envRef = process.env.CATEGORY_REFERENCE_FILE;
      // Conservative local fallback (works if API process runs from repo root)
      const fallbackRef = join(
        process.cwd(),
        "packages/schemas/src/ulpc/category_reference.v1.json"
      );
      const refPath = envRef && existsSync(envRef)
        ? envRef
        : existsSync(fallbackRef)
          ? fallbackRef
          : null;

      if (!refPath) {
        return res.status(500).json({
          ok: false,
          code: "MISSING_CATEGORY_REFERENCE",
          message:
            "Set CATEGORY_REFERENCE_FILE to the absolute path of category_reference.v1.json",
        });
      }

      const categoryReference = await loadCategoryReferenceFromDisk(refPath);

      // Convert (converter returns a discriminated union)
      const result = await convertCharIntermediaryToUlpc(intermediary, {
        categoryReference,
        animations:
          Array.isArray(animations) && animations.length ? animations : undefined, // let converter default to ["idle"]
        loggerName: "api:intermediary",
      });

      // Narrow to OK variant before reading .build
      if (!result || typeof result !== "object" || (result as any).ok !== true) {
        // Bubble up detailed errors/trace from the converter
        return res.status(400).json(result);
      }
      const okResult = result as { ok: true; build: any; trace: any[] };

      // If not composing, just return the conversion
      if (!compose) {
        return res.json(okResult);
      }

      // ---- Compose path resolution ----
      let finalOutPath: string;
      if (typeof outPath === "string" && outPath.length) {
        // Respect explicit path
        try {
          await (ensureDir?.(dirname(outPath)) as Promise<void> | undefined);
        } catch {
          await mkdir(dirname(outPath), { recursive: true });
        }
        finalOutPath = outPath;
      } else if (typeof slug === "string" && slug.length && process.env.ASSET_ROOT) {
        // Place under character preview folder
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
        // Safe tmp fallback
        const dir = join(os.tmpdir(), "pixelart-preview");
        await mkdir(dir, { recursive: true });
        finalOutPath = join(dir, `ulpc_${Date.now()}.png`);
      }

      // Compose PNG (cast signature once to avoid TS noise)
      const composed = await composeULPC(okResult.build as any, finalOutPath);

      return res.json({
        ...okResult,
        composed, // { outPath, bytes, layers, width, height }
      });
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
