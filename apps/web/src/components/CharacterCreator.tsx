// apps/web/src/components/CharacterCreator.tsx
import { useMemo, useRef, useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

// UI + form
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CharacterForm } from "@/components/character/CharacterForm";

// API helpers
import { assistantTurn, validateLite, commitLite } from "@/lib/api";
import type { CharacterDefinitionLite } from "@/types";

// ───────────────────────────────── helpers ─────────────────────────────────
type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

const LS_KEY = "pa_chars";

const initialDraft: CharacterDefinitionLite = {
  client_ready: false,
  identity: { char_name: "" },
  personality: {
    desire: "",
    fear: "",
    flaw: "",
    traits: [],
  },
  physical: {
    age_range: "adult",
    height_category: "average",
    build: "average",
    skin_tone: "tan",
    hair_color: "brown",
    eye_color: "green",
  },
};

function isLiteComplete(d: CharacterDefinitionLite): boolean {
  const p = d.personality, ph = d.physical, id = d.identity;
  return Boolean(
    d.client_ready === true &&
      id?.char_name &&
      p?.desire && p?.fear && p?.flaw &&
      Array.isArray(p?.traits) && p.traits.length >= 1 &&
      ph?.age_range && ph?.height_category && ph?.build &&
      ph?.skin_tone && ph?.hair_color && ph?.eye_color
  );
}

function rememberSlug(slug: string) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(slug)) {
      arr.push(slug);
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    }
  } catch {
    // ignore
  }
}

function toSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ───────────────────────────────── component ───────────────────────────────
export default function CharacterCreator() {
  const nav = useNavigate();

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "system", content: "You are a helpful assistant that drafts a character spec." },
    {
      role: "assistant",
      content:
        "Tell me the character’s name, traits, and look. For example:\n" +
        "name: Aria, traits: brave,witty, age: adult, build: slim, hair: brown, eyes: green, skin: tan, desire: X, fear: Y, flaw: Z",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // chat auto-scroll
  const chatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  // Form model
  const [form, setForm] = useState<CharacterDefinitionLite>(initialDraft);
  const [traitsText, setTraitsText] = useState("");

  // Thread for assistant (user/assistant only)
  const threadForAssistant = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    [messages]
  );

  // Derived flags
  const canCommit = isLiteComplete(form);
  const derivedSlug = useMemo(() => toSlug(form.identity.char_name || ""), [form.identity.char_name]);

  // ────────────── local helpers ──────────────
  function applyTraitsTextToForm(text: string) {
    setTraitsText(text);
    setForm((prev) => ({
      ...prev,
      personality: {
        ...prev.personality,
        traits: text.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
      },
    }));
  }

  // instant parse for quick feedback
  function applyChatDelta(text: string) {
    const m = text.toLowerCase();
    const next: CharacterDefinitionLite = {
      ...form,
      personality: { ...form.personality },
      physical: { ...form.physical },
      identity: { ...form.identity },
    };

    const pick = (k: string) => {
      const r = new RegExp(`${k}\\s*:\\s*([^,\\n]+)`);
      const mm = m.match(r);
      return mm?.[1]?.trim();
    };

    const v: Partial<Record<string, string>> = {
      name: pick("name") || pick("char_name"),
      desire: pick("desire"),
      fear: pick("fear"),
      flaw: pick("flaw"),
      traits: pick("traits"),
      age: pick("age") || pick("age_range"),
      height: pick("height") || pick("height_category"),
      build: pick("build"),
      hair: pick("hair") || pick("hair_color"),
      eyes: pick("eyes") || pick("eye_color"),
      skin: pick("skin") || pick("skin_tone"),
    };

    if (v.name) next.identity.char_name = v.name;
    if (v.desire) next.personality.desire = v.desire;
    if (v.fear) next.personality.fear = v.fear;
    if (v.flaw) next.personality.flaw = v.flaw;
    if (v.traits) applyTraitsTextToForm(v.traits);

    const A = ["child", "teen", "adult", "elder"] as const;
    const H = ["short", "average", "tall"] as const;
    const B = ["slim", "average", "heavy", "muscular"] as const;
    if (v.age && A.includes(v.age as any)) next.physical.age_range = v.age as any;
    if (v.height && H.includes(v.height as any)) next.physical.height_category = v.height as any;
    if (v.build && B.includes(v.build as any)) next.physical.build = v.build as any;

    if (v.hair) next.physical.hair_color = v.hair;
    if (v.eyes) next.physical.eye_color = v.eyes;
    if (v.skin) next.physical.skin_tone = v.skin;

    setForm(next);
  }

  // ────────────── mutations ──────────────
  const mValidate = useMutation({
    mutationFn: async (payload: CharacterDefinitionLite) => validateLite(payload),
  });

  const mCommit = useMutation({
    mutationFn: async (payload: CharacterDefinitionLite) => commitLite(payload),
    onSuccess: (res) => {
      if (res?.slug) {
        rememberSlug(res.slug);
        nav(`/characters/${res.slug}`);
      }
    },
  });

  // ────────────── handlers ──────────────
  async function onSend(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;

    // append user msg
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");

    // local parse for instant feedback
    applyChatDelta(text);

    setIsTyping(true);
    try {
      const res = await assistantTurn({
        message: text,
        draft: form,
        thread: threadForAssistant,
      });

      // Debug: log entire assistant payload
      console.log("[CharacterCreator] assistantTurn →", res);

      // append assistant reply
      if (res?.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.message }]);
      }

      // apply server-validated draft
      if (res?.draft) {
        setForm(res.draft as CharacterDefinitionLite);
        setTraitsText((res.draft.personality?.traits ?? []).join(", "));
      }
    } catch (err: any) {
      console.error("[CharacterCreator] assistantTurn error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry—assistant failed: ${String(err?.message ?? err)}` },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function onFormChange(next: CharacterDefinitionLite) {
    setForm(next);
    setTraitsText((next.personality.traits ?? []).join(", "));
  }

  // ────────────── UI ──────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
      {/* Chat / Guidance */}
      <Card className="border rounded-2xl shadow-sm">
        <CardContent className="p-4 flex flex-col h-[70dvh]">
          <div
            ref={chatRef}
            className="flex-1 overflow-auto space-y-3 pb-[100px]" // ← ensure 100px bottom padding
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "bg-blue-50 border border-blue-100 rounded-xl px-3 py-2"
                    : m.role === "assistant"
                    ? "bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                    : "text-xs text-slate-500"
                }
              >
                <div className="text-[11px] uppercase tracking-wide opacity-60 mb-0.5">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}

            {isTyping && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 animate-pulse">
                <div className="text-[11px] uppercase tracking-wide opacity-60 mb-0.5">
                  assistant
                </div>
                <div className="whitespace-pre-wrap">typing…</div>
              </div>
            )}
          </div>

          <form onSubmit={onSend} className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe name/traits/look… or ask the assistant."
              className="flex-1 rounded-xl border px-3 py-2 outline-none focus:ring"
            />
            <Button type="submit" disabled={isTyping}>
              {isTyping ? "Thinking…" : "Send"}
            </Button>
          </form>

          <div className="mt-3 text-xs text-slate-500">
            Tip: you can type things like <code>name: Aria, traits: brave,witty</code>
          </div>
        </CardContent>
      </Card>

      {/* Form / Actions */}
      <div className="space-y-4">
        <Card className="border rounded-2xl shadow-sm">
          <CardContent className="p-4">
            {/* Keep your existing CharacterForm; no duplication */}
            <div className="mb-3">
              <label className="text-xs text-slate-600">Traits (comma-separated)</label>
              <input
                value={traitsText}
                onChange={(e) => applyTraitsTextToForm(e.target.value)}
                placeholder="brave,witty"
                className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              />
            </div>

            <CharacterForm
              value={form}
              onChange={onFormChange}
              traitsText={traitsText}
              onTraitsTextChange={applyTraitsTextToForm}
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => mValidate.mutate(form)}
                disabled={mValidate.isPending}
              >
                {mValidate.isPending ? "Validating…" : "Validate"}
              </Button>

              <Button
                type="button"
                onClick={() => mCommit.mutate(form)}
                disabled={!canCommit || mCommit.isPending}
                title={!canCommit ? "Fill required fields first" : ""}
              >
                {mCommit.isPending ? "Creating…" : "Create Character"}
              </Button>

              <div className="text-xs text-slate-500 ml-auto">
                Slug preview: <code>{derivedSlug || "(empty)"}</code>
              </div>
            </div>

            {mValidate.data && !mValidate.data.ok && (
              <div className="mt-3 text-sm text-red-600">
                Validation failed:
                <pre className="whitespace-pre-wrap text-xs bg-red-50 border border-red-100 rounded p-2 mt-1">
                  {JSON.stringify(mValidate.data.errors ?? null, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
