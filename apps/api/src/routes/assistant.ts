// apps/api/src/routes/assistant.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAssistantTurn, InvalidAssistantPayloadError } from "@pixelart/assistants";
import { readProjectSettings } from "@pixelart/config";

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


assistantRouter.post("/assistant/turn", async (req: Request, res: Response) => {
  try {
    const { message, draft, slug, thread, persist } = req.body ?? {};
    if (!message) {
      return res.status(400).json({ ok: false, code: "BAD_REQUEST", message: "message required" });
    }

      // Prefer project settings; fallback to env vars
      const proj = (await readProjectSettings()) as any;
      const apiKey = (proj?.llm?.apiKey as string) || process.env.OPENAI_API_KEY;
      const assistantId = (proj?.llm?.chatAssistantId as string) || process.env.OPENAI_ASSISTANT_ID;
      if (!apiKey || !assistantId) {
        return res.status(400).json({
          ok: false,
          error: "missing_openai_config",
          detail: "Missing OPENAI_API_KEY or chat assistant id (settings.llm.chatAssistantId or OPENAI_ASSISTANT_ID)",
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



    const result = await runAssistantTurn({
      userMessage: message,
      draft: draft ?? baseDraft,
      thread,
      openai: { apiKey, assistantId },
    });

    // optionally persist result.draft here

    return res.json({ ok: true, message: result.assistantText, draft: result.draft });

  } catch (err: any) {
    if (err instanceof InvalidAssistantPayloadError) {
      // ← return the validator’s summaries so we can see WHAT failed
      return res.status(400).json({
        ok: false,
        code: "INVALID_ASSISTANT_PAYLOAD",
        errors: err.errors,
      });
    }
    console.error("[assistant.turn] unexpected error:", err);
    return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "assistant_error" });
  }
});
