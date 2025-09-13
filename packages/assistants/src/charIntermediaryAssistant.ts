// ESM / NodeNext compatible
import OpenAI from "openai";
import * as schemas from "@pixelart/schemas";

// ────────────────────────────────────────────────────────────────────────────
// Interop with @pixelart/schemas (CJS/ESM neutral) — NO direct Ajv usage here
// ────────────────────────────────────────────────────────────────────────────
const validateCharIntermediaryPayload =
  (schemas as any).default?.validateCharIntermediaryPayload ??
  (schemas as any).validateCharIntermediaryPayload;

// Types: re-use your shared AjvSummary if exported; otherwise declare minimal
type SchemaAjvSummary =
  (typeof schemas extends { AjvSummary: infer T } ? T : Array<{ message: string; instancePath?: string; keyword?: string }>);

export type AjvSummary = SchemaAjvSummary;

// Public types (local)
export type AssistantThreadMsg = { role: "user" | "assistant"; content: string };

export type CharIntermediary = {
  body_type: "male" | "muscular" | "female" | "teen" | "child";
  head_type: string; // one filename from the enum you forced at the Assistant level
  categories: Array<{
    category: string;
    preferred_colour: string;
    items: string[];
  }>;
};

export type IntermediaryTurnInput = {
  userMessage: string;
  thread?: AssistantThreadMsg[];
  baseDraft?: unknown; // CharacterDefinitionLite for context (optional)
  openai: { apiKey: string; assistantId: string };
};

export type IntermediaryTurnResult = {
  data: CharIntermediary;
  rawText: string;
};

export class InvalidIntermediaryPayloadError extends Error {
  constructor(public readonly errors: AjvSummary) {
    super("invalid_char_intermediary_payload");
    this.name = "InvalidIntermediaryPayloadError";
  }
}

const DEBUG = (process.env.ASSISTANT_DEBUG ?? "").toLowerCase() === "true";

// Small helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripJsonFence(s: string): string {
  // remove ```json ... ``` or ``` ... ``` fences if present
  return s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildPrompt(baseDraft: unknown, userMessage: string, thread?: AssistantThreadMsg[]) {
  const header =
    "Return ONLY a single JSON object that conforms to the enforced Char_Intermediary schema. " +
    "Use only categories and item filenames from the attached Category Reference. " +
    "No prose or markdown — just the JSON object.\n\n";

  const draftBlock = baseDraft
    ? `Current character-lite JSON (context):\n\`\`\`json\n${JSON.stringify(baseDraft, null, 2)}\n\`\`\`\n\n`
    : "";

  let convo = "";
  if (thread?.length) {
    const last = thread.slice(-6);
    const lines = last.map((m) => `${m.role}: ${m.content}`);
    convo = `Conversation context:\n${lines.join("\n")}\n\n`;
  }

  const user = `User message:\n${userMessage}\n`;
  return header + draftBlock + convo + user;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
export async function runCharIntermediaryTurn(input: IntermediaryTurnInput): Promise<IntermediaryTurnResult> {
  if (typeof validateCharIntermediaryPayload !== "function") {
    throw new Error(
      "missing_schema_validator: @pixelart/schemas must export validateCharIntermediaryPayload() " +
      "(mirroring validateAssistantChatPayload)."
    );
  }

  const client = new OpenAI({ apiKey: input.openai.apiKey });
  const content = buildPrompt(input.baseDraft, input.userMessage, input.thread);

  // Create a short-lived thread; prior thread context is folded into `content`.
  const thread = await client.beta.threads.create({ messages: [{ role: "user", content }] });

  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: input.openai.assistantId,
    additional_instructions:
      "Always return a single JSON object that matches the Char_Intermediary schema. " +
      "Do not include explanations or code fences."
  });

  // Poll until terminal
  let status = run.status;
  for (let i = 0; i < 60 && !["completed", "failed", "cancelled", "expired"].includes(status); i++) {
    await sleep(500);
    const r2 = await client.beta.threads.runs.retrieve(thread.id, run.id);
    status = r2.status;
  }
  if (status !== "completed") throw new Error(`char_intermediary_run_not_completed:${status}`);

  // Fetch latest assistant message
  const msgs = await client.beta.threads.messages.list(thread.id, { order: "desc", limit: 10 });
  const firstAssistantMsg = msgs.data.find((m) => m.role === "assistant");

  const rawText =
    (firstAssistantMsg?.content ?? [])
      .map((c: any) => (c.type === "text" ? c.text.value : ""))
      .join("\n")
      .trim() || "";

  if (DEBUG) {
    console.group?.("[char_intermediary] raw assistant output");
    console.log(rawText);
    console.groupEnd?.();
  }

  if (!rawText) throw new InvalidIntermediaryPayloadError([{ message: "empty assistant output" } as any]);

  // Parse JSON (support fenced blocks)
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(rawText));
  } catch {
    throw new InvalidIntermediaryPayloadError([{ message: "non-json output" } as any]);
  }

  // Validate using the shared validator from @pixelart/schemas
  // Expect a result shape similar to: { ok: true, data: <CharIntermediary> } | { ok: false, errors }
  const v = validateCharIntermediaryPayload(parsed) as
    | { ok: true; data: CharIntermediary }
    | { ok: false; errors: AjvSummary };

  if (!("ok" in v) || !v.ok) {
    if (DEBUG) {
      console.group?.("[char_intermediary] validation errors");
      console.dir((v as any).errors, { depth: 6 });
      console.groupEnd?.();
    }
    throw new InvalidIntermediaryPayloadError((v as any).errors ?? []);
  }

  return { data: (v as any).data as CharIntermediary, rawText };
}
