// packages/assistants/src/characterAssistant.ts
// NodeNext / ESM compatible

import OpenAI from "openai";
import * as schemas from "@pixelart/schemas";

// ────────────────────────────────────────────────────────────────────────────
// Interop: @pixelart/schemas is CJS; support both default and named exports.
// ────────────────────────────────────────────────────────────────────────────
const validateAssistantChatPayload =
  (schemas as any).default?.validateAssistantChatPayload ??
  (schemas as any).validateAssistantChatPayload;

import type {
  CharacterLite,
  AjvSummary as SchemaAjvSummary,
} from "@pixelart/schemas";

// Re-export the AjvSummary shape used project-wide for consistency
export type AjvSummary = SchemaAjvSummary;

export type AssistantThreadMsg = { role: "user" | "assistant"; content: string };

export type AssistantTurnInput = {
  userMessage: string;
  /** Optional short chat history; we fold it into the single prompt sent to the Assistant */
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
  /** Short assistant reply suitable for chat UI */
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
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripJsonFence(s: string): string {
  // Remove ```json ... ``` fences if present
  return s.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

function buildPrompt(draft: unknown, userMessage: string, thread?: AssistantThreadMsg[]) {
  // Keep this directive strong; the Assistant must return a *single JSON object* only.
  const header =
    "Return ONLY a single JSON object that validates the project schema. No prose before or after.\n\n";

  const draftBlock = `Current draft JSON:\n\`\`\`json\n${JSON.stringify(draft, null, 2)}\n\`\`\`\n\n`;

  let convo = "";
  if (thread && thread.length) {
    // Keep it short: include up to the last 6 messages, user-then-assistant pairs ideally.
    const last = thread.slice(-6);
    const lines = last.map((m) => `${m.role}: ${m.content}`);
    convo = `Conversation so far (context only):\n${lines.join("\n")}\n\n`;
  }

  const user = `User message:\n${userMessage}\n`;

  // Important: the schema contract is handled by the validator below; the Assistant
  // must include a "message" field for chat text, and the rest must form a valid CharacterLite.
  const reminder =
    "\nRequirements:\n" +
    '- Include a "message" string for the chat response.\n' +
    "- All other fields must form a valid CharacterDefinitionLite according to the project schema.\n" +
    "- Do not include markdown, backticks, or extra text. Only the JSON object.\n";

  return header + draftBlock + convo + user + reminder;
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run a single Assistant turn against the provided draft + user message.
 * The Assistant must return a JSON object with a "message" field plus a valid CharacterLite draft.
 * We validate with @pixelart/schemas and return the sanitized result.
 */
export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const client = new OpenAI({ apiKey: input.openai.apiKey });

  // Build a single user message with draft + (optional) short thread context
  const content = buildPrompt(input.draft, input.userMessage, input.thread);

  // Create a fresh thread (we keep server-thread lifetimes ephemeral;
  // the caller can persist "thread" context separately and we fold it into content).
  const thread = await client.beta.threads.create({
    messages: [{ role: "user", content }],
  });

  // Start a run with the configured assistant
  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: input.openai.assistantId,
  });

  // Poll until completed/terminal
  let status = run.status;
  for (let i = 0; i < 60 && !["completed", "failed", "cancelled", "expired"].includes(status); i++) {
    await sleep(500);
    const r2 = await client.beta.threads.runs.retrieve(thread.id, run.id);
    status = r2.status;
  }
  if (status !== "completed") {
    throw new Error(`assistant_run_not_completed:${status}`);
  }

  // Fetch the latest assistant message
  const msgs = await client.beta.threads.messages.list(thread.id, {
    order: "desc",
    limit: 10,
  });
  const firstAssistantMsg = msgs.data.find((m) => m.role === "assistant");

  const text = (firstAssistantMsg?.content ?? [])
    .map((c) => (c.type === "text" ? c.text.value : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new InvalidAssistantPayloadError([
      { message: "empty assistant output", instancePath: "", keyword: "minLength" },
    ]);
  }

  // Parse JSON (allow for fenced ```json blocks)
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    throw new InvalidAssistantPayloadError([
      { message: "non-json output", instancePath: "", keyword: "type" },
    ]);
  }

  // Validate against shared schema contract
  const v = validateAssistantChatPayload(parsed) as
    | { ok: true; message: string; draft: CharacterLite }
    | { ok: false; errors: AjvSummary };

  if (!("ok" in v) || !v.ok) {
    throw new InvalidAssistantPayloadError(v.ok ? [] : v.errors);
  }

  // Success: return assistant chat text + sanitized CharacterLite draft
  return { assistantText: v.message, draft: v.draft };
}
