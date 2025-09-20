// apps/api/src/routes/assistant.intermediary.ts
import { Router, type Request, type Response } from "express";
import { runCharIntermediaryTurn, InvalidIntermediaryPayloadError } from "@pixelart/assistants";

export const assistantIntermediaryRouter: import("express").Router = Router();

assistantIntermediaryRouter.post("/assistant/char-intermediary", async (req: Request, res: Response) => {
  try {
    const { message, baseDraft, thread } = req.body ?? {};
    if (!message) return res.status(400).json({ ok: false, code: "BAD_REQUEST", message: "message required" });

    const preview = typeof message === "string" ? message.slice(0, 120) : "";
    console.log("[assistant.char-intermediary] request", {
      preview,
      previewLength: preview.length,
      hasBaseDraft: Boolean(baseDraft),
      hasThread: Boolean(thread),
    });

    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.OPENAI_CHAR_INTERMEDIARY_ASSISTANT_ID;
    if (!apiKey || !assistantId) {
      return res.status(400).json({
        ok: false,
        error: "missing_openai_config",
        detail: "OPENAI_API_KEY and OPENAI_CHAR_INTERMEDIARY_ASSISTANT_ID are required",
      });
    }

    const result = await runCharIntermediaryTurn({
      userMessage: message,
      baseDraft,
      thread,
      openai: { apiKey, assistantId },
    });

    const catCount = Array.isArray(result?.data?.categories) ? result.data.categories.length : 0;
    console.log("[assistant.char-intermediary] success", {
      categories: catCount,
      bodyType: result?.data?.body_type,
      headType: result?.data?.head_type,
    });

    return res.json({ ok: true, data: result.data });
  } catch (err: any) {
    if (err instanceof InvalidIntermediaryPayloadError) {
      return res.status(400).json({ ok: false, code: "INVALID_INTERMEDIARY_PAYLOAD", errors: err.errors });
    }
    if (String(err?.message || "").startsWith("missing_schema_validator")) {
      return res.status(500).json({ ok: false, code: "MISSING_VALIDATOR", message: String(err.message) });
    }
    console.error("[assistant.char-intermediary] unexpected error:", err);
    return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "assistant_error" });
  }
});
