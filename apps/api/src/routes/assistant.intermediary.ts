// apps/api/src/routes/assistant.intermediary.ts
import { Router, type Request, type Response } from "express";
import { runCharIntermediaryTurn, InvalidIntermediaryPayloadError } from "@pixelart/assistants";
import { writeIntermediary } from "@pixelart/config";

export const assistantIntermediaryRouter: import("express").Router = Router();

assistantIntermediaryRouter.post("/assistant/char-intermediary", async (req: Request, res: Response) => {
  try {
    const { message, baseDraft, thread, slug: rawSlug } = req.body ?? {};
    if (!message) return res.status(400).json({ ok: false, code: "BAD_REQUEST", message: "message required" });

    const preview = typeof message === "string" ? message.slice(0, 120) : "";
    console.log("[assistant.char-intermediary] request", {
      preview,
      previewLength: preview.length,
      hasBaseDraft: Boolean(baseDraft),
      hasThread: Boolean(thread),
      slug: rawSlug ?? baseDraft?.identity?.char_slug ?? null,
    });

    const slug = typeof rawSlug === "string" && rawSlug.length
      ? rawSlug
      : typeof baseDraft?.identity?.char_slug === "string" && baseDraft.identity.char_slug.length
        ? baseDraft.identity.char_slug
        : null;
    if (!slug) {
      return res.status(400).json({ ok: false, code: "SLUG_REQUIRED", message: "slug is required for intermediary generation" });
    }

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
      slug,
    });

    try {
      await writeIntermediary(slug, result.data);
      console.log("[assistant.char-intermediary] persisted_intermediary", { slug });
    } catch (err: any) {
      console.error("[assistant.char-intermediary] failed_to_persist", { slug, error: err?.message });
    }

    return res.json({ ok: true, data: result.data });
  } catch (err: any) {
    if (err instanceof InvalidIntermediaryPayloadError) {
      console.warn("[assistant.char-intermediary] invalid_payload", {
        slug: (req.body?.slug as string) ?? req.body?.baseDraft?.identity?.char_slug ?? null,
        errors: err.errors,
      });
      return res.status(400).json({ ok: false, code: "INVALID_INTERMEDIARY_PAYLOAD", errors: err.errors });
    }
    if (String(err?.message || "").startsWith("missing_schema_validator")) {
      return res.status(500).json({ ok: false, code: "MISSING_VALIDATOR", message: String(err.message) });
    }
    console.error("[assistant.char-intermediary] unexpected error:", err);
    return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "assistant_error" });
  }
});
