// apps/api/src/routes/assistant.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAssistantTurn } from "@pixelart/assistants";

export const assistantRouter: import("express").Router = Router();

/**
 * POST /assistant/turn
 * body: {
 *   message: string;
 *   draft?: any;
 *   slug?: string;
 *   thread?: Array<{ role: "user" | "assistant"; content: string }>;
 *   persist?: boolean;
 * }
 *
 * If `slug` is provided and `draft` is absent, loads char_def_lite_<slug>.json from ASSET_ROOT.
 * Calls the assistant which returns a *validated full draft* (not a JSON Patch).
 * Optionally persists the new draft to disk when `persist=true` and `slug` is provided.
 */
assistantRouter.post(
  "/assistant/turn",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, draft, slug, thread, persist } = req.body ?? {};
      if (!message) {
        return res.status(400).json({ ok: false, error: "message required" });
      }

      // Strict: require OpenAI config (no fallback)
      const apiKey = process.env.OPENAI_API_KEY;
      const assistantId = process.env.OPENAI_ASSISTANT_ID;
      if (!apiKey || !assistantId) {
        return res.status(400).json({
          ok: false,
          error: "missing_openai_config",
          detail: "OPENAI_API_KEY and OPENAI_ASSISTANT_ID are required",
        });
      }

      // Load base draft from disk if slug provided and no draft passed
      let baseDraft: unknown = draft;
      let savePath: string | null = null;

      if (!baseDraft && slug) {
        const assetsRoot = process.env.ASSET_ROOT!;
        savePath = join(assetsRoot, slug, `char_def_lite_${slug}.json`);
        const json = await readFile(savePath, "utf8").catch(() => null);
        if (!json) {
          return res.status(404).json({ ok: false, error: "unknown slug" });
        }
        baseDraft = JSON.parse(json);
      }

      if (!baseDraft) {
        return res
          .status(400)
          .json({ ok: false, error: "draft or slug required" });
      }

      // Ask assistant → returns assistantText + full validated draft
      const result = await runAssistantTurn({
        userMessage: message,
        draft: baseDraft,
        thread,
        openai: { apiKey, assistantId },
      });

      const newDraft = result.draft;

      // Optionally persist if we loaded by slug
      if (persist && slug && savePath) {
        await writeFile(savePath, JSON.stringify(newDraft, null, 2), "utf8");
      }

      return res.json({
        ok: true,
        message: result.assistantText,
        draft: newDraft,
      });
    } catch (err) {
      next(err as any);
    }
  }
);
