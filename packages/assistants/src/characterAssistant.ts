// packages/assistants/src/characterAssistant.ts
// ESM / NodeNext compatible

import OpenAI from "openai";
import * as schemas from "@pixelart/schemas";

// ────────────────────────────────────────────────────────────────────────────
// Interop with @pixelart/schemas (CJS/ESM neutral)
// ────────────────────────────────────────────────────────────────────────────
const validateAssistantChatPayload =
  (schemas as any).default?.validateAssistantChatPayload ??
  (schemas as any).validateAssistantChatPayload;

import type {
  CharacterLite,
  AjvSummary as SchemaAjvSummary,
} from "@pixelart/schemas";

export type AjvSummary = SchemaAjvSummary;

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────
export type AssistantThreadMsg = { role: "user" | "assistant"; content: string };

export type AssistantTurnInput = {
  userMessage: string;
  /** Optional short chat history; folded into a single prompt */
  thread?: AssistantThreadMsg[];
  /** Current draft document to refine */
  draft: unknown;
  /** OpenAI config */
  openai: {
    apiKey: string;
    assistantId: string;
  };
};

export type AssistantTurnResult = {
  /** Chat-sized reply for the UI */
  assistantText: string;
  /** Fully validated CharacterLite draft */
  draft: CharacterLite;
};

export class InvalidAssistantPayloadError extends Error {
  constructor(public readonly errors: AjvSummary) {
    super("invalid_assistant_payload");
    this.name = "InvalidAssistantPayloadError";
  }
}

// ────────────────────────────────────────────────────────────────────────────
const DEBUG = (process.env.ASSISTANT_DEBUG ?? "").toLowerCase() === "true";

// Small helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripJsonFence(s: string): string {
  // remove ```json ... ``` or ``` ... ``` fences if present
  return s.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildPrompt(draft: unknown, userMessage: string, thread?: AssistantThreadMsg[]) {
  // Strong directive: only JSON object back, shaped for our project schema.
  const header =
    "Return ONLY a single JSON object that validates the project's CharacterDefinitionLite *chat payload* schema. " +
    "No prose before or after.\n\n";

  const draftBlock = `Current draft JSON:\n\`\`\`json\n${JSON.stringify(draft, null, 2)}\n\`\`\`\n\n`;

  let convo = "";
  if (thread?.length) {
    const last = thread.slice(-6);
    const lines = last.map((m) => `${m.role}: ${m.content}`);
    convo = `Conversation so far (context only):\n${lines.join("\n")}\n\n`;
  }

  const user = `User message:\n${userMessage}\n`;

  const reminder =
    "\nRequirements:\n" +
    '- Include a short "message" string for the chat reply (<= 240 chars).\n' +
    "- The rest must form a valid CharacterDefinitionLite according to the project schema.\n" +
    "- You MUST include identity.char_name and identity.char_slug (^[a-z0-9_]+$). " +
    "If char_slug is missing, derive it from char_name: lowercase, non [a-z0-9_] → '_', trim leading/trailing '_'.\n" +
    "- Do not include markdown or backticks; only return the JSON object.\n";

  return header + draftBlock + convo + user + reminder;
}

// Optional belt-and-suspenders fixup before validation
function ensureSlug(payload: any, currentDraft: unknown): void {
  try {
    const existingSlug =
      typeof currentDraft === "object" &&
      currentDraft !== null &&
      (currentDraft as any).identity?.char_slug;

    if (!payload || typeof payload !== "object") return;
    if (!payload.identity || typeof payload.identity !== "object") return;

    const proposedSlug = payload.identity.char_slug;
    const name = payload.identity.char_name;

    // Preserve a non-empty existing slug if present in the draft and assistant omitted one
    if (!proposedSlug && existingSlug && typeof existingSlug === "string" && existingSlug.length > 0) {
      payload.identity.char_slug = existingSlug;
      return;
    }

    // Otherwise derive if missing or invalid-ish
    if ((!proposedSlug || typeof proposedSlug !== "string" || !/^[a-z0-9_]+$/.test(proposedSlug)) && typeof name === "string") {
      const derived = deriveSlug(name);
      if (derived) payload.identity.char_slug = derived;
    }
  } catch {
    // non-fatal
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const client = new OpenAI({ apiKey: input.openai.apiKey });

  const content = buildPrompt(input.draft, input.userMessage, input.thread);

  // Create short-lived thread; we fold any prior thread context into `content`.
  const thread = await client.beta.threads.create({
    messages: [{ role: "user", content }],
  });

  // Add a concise system-like instruction through additional_instructions
  const additional_instructions =
    "Always return a single JSON object matching the chat payload contract. " +
    "Include identity.char_slug and keep it stable once set.";

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: input.openai.assistantId,
    additional_instructions,
  });

  // Poll until terminal
  let status = run.status;
  for (let i = 0; i < 60 && !["completed", "failed", "cancelled", "expired"].includes(status); i++) {
    await sleep(500);
    const r2 = await client.beta.threads.runs.retrieve(thread.id, run.id);
    status = r2.status;
  }
  if (status !== "completed") {
    throw new Error(`assistant_run_not_completed:${status}`);
  }

  // Fetch latest assistant message
  const msgs = await client.beta.threads.messages.list(thread.id, { order: "desc", limit: 10 });
  const firstAssistantMsg = msgs.data.find((m) => m.role === "assistant");

  const rawText =
    (firstAssistantMsg?.content ?? [])
      .map((c) => (c.type === "text" ? c.text.value : ""))
      .join("\n")
      .trim() || "";

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.group?.("[assistants] raw assistant output");
    // eslint-disable-next-line no-console
    console.log(rawText);
    console.groupEnd?.();
  }

  if (!rawText) {
    throw new InvalidAssistantPayloadError([{ message: "empty assistant output" }]);
  }

  // Parse JSON (support fenced blocks)
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(rawText));
  } catch {
    throw new InvalidAssistantPayloadError([{ message: "non-json output" }]);
  }

  // Pre-validate safety: ensure slug presence/stability
  ensureSlug(parsed as any, input.draft);

  // Validate with shared AJV
  const v = validateAssistantChatPayload(parsed) as
    | { ok: true; message: string; draft: CharacterLite }
    | { ok: false; errors: AjvSummary };

  if (!("ok" in v) || !v.ok) {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.group?.("[assistants] validation errors");
      // eslint-disable-next-line no-console
      console.dir((v as any).errors, { depth: 6 });
      console.groupEnd?.();
    }
    throw new InvalidAssistantPayloadError(v.ok ? [] : v.errors);
  }

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.group?.("[assistants] parsed payload (validated)");
    // eslint-disable-next-line no-console
    console.dir({ message: v.message, draft: v.draft }, { depth: 4 });
    console.groupEnd?.();
  }

  return { assistantText: v.message, draft: v.draft };
}
