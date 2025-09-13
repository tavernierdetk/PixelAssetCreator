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
  message: "",
  client_ready: false,
  identity: { char_name: "" }, // slug is set on validate/commit
  personality: {
    desire: "",
    fear: "",
    flaw: "",
    traits: [],
  },
  physical: {
    species: "",
    age_range: "adult",
    gender: "unspecified",         // REQUIRED by schema/types
    height_category: "average",
    build: "average",
    skin_tone: "#a36c3f",
    hair_color: "#5b3b1a",
    hair_style: "",
    eye_color: "#2e7f4f",
    distinctive_features: [],
    aesthetic_vibe: "",
  },
};

function isLiteComplete(d: CharacterDefinitionLite): boolean {
  const p = d.personality, ph = d.physical, id = d.identity;
  return Boolean(
    d.client_ready === true &&
      id?.char_name &&
      p?.desire && p?.fear && p?.flaw &&
      Array.isArray(p?.traits) && p.traits.length >= 2 && // schema minItems: 2
      ph?.age_range && ph?.height_category && ph?.build &&
      ph?.skin_tone && ph?.hair_color && ph?.eye_color &&
      ph?.gender // now required
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

function csvParseUnique(input: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
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

  // Form model + CSV editors for arrays
  const [form, setForm] = useState<CharacterDefinitionLite>(initialDraft);
  const [traitsText, setTraitsText] = useState("");
  const [valuesText, setValuesText] = useState("");
  const [featuresText, setFeaturesText] = useState("");

  // Seed CSV editors from draft once (on mount) — safe for blank initialDraft too
  useEffect(() => {
    setTraitsText((form.personality.traits ?? []).join(", "));
    setValuesText((form.personality.values ?? []).join(", "));
    setFeaturesText((form.physical.distinctive_features ?? []).join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ────────────── CSV <→ form helpers ──────────────
  function applyTraitsTextToForm(text: string) {
    setTraitsText(text);
    setForm((prev) => ({
      ...prev,
      personality: {
        ...prev.personality,
        traits: csvParseUnique(text, 6),
      },
    }));
  }
  function applyValuesTextToForm(text: string) {
    setValuesText(text);
    setForm((prev) => ({
      ...prev,
      personality: {
        ...prev.personality,
        values: csvParseUnique(text, 5),
      },
    }));
  }
  function applyFeaturesTextToForm(text: string) {
    setFeaturesText(text);
    setForm((prev) => ({
      ...prev,
      physical: {
        ...prev.physical,
        distinctive_features: csvParseUnique(text, 6),
      },
    }));
  }

  // instant parse for quick feedback from chat
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
      values: pick("values"),
      features: pick("features") || pick("distinctive_features"),
      age: pick("age") || pick("age_range"),
      gender: pick("gender"),
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
    if (v.values) applyValuesTextToForm(v.values);
    if (v.features) applyFeaturesTextToForm(v.features);

    const A = ["child", "teen", "young_adult", "adult", "middle_aged", "elder"] as const;
    const H = ["short", "average", "tall"] as const;
    const B = ["slim", "average", "muscular", "heavy", "lithe", "stocky", "other"] as const;
    const G = ["male", "female", "nonbinary", "unspecified"] as const;

    if (v.age && A.includes(v.age as any)) next.physical.age_range = v.age as any;
    if (v.height && H.includes(v.height as any)) next.physical.height_category = v.height as any;
    if (v.build && B.includes(v.build as any)) next.physical.build = v.build as any;
    if (v.gender && G.includes(v.gender as any)) next.physical.gender = v.gender as any;

    if (v.hair) next.physical.hair_color = v.hair;
    if (v.eyes) next.physical.eye_color = v.eyes;
    if (v.skin) next.physical.skin_tone = v.skin;

    setForm(next);
  }

  // Prepare payload for server (inject slug + arrays from CSV)
  function serializeForServer(src: CharacterDefinitionLite): CharacterDefinitionLite {
    return {
      ...src,
      identity: { ...src.identity, char_slug: derivedSlug },
      personality: {
        ...src.personality,
        traits: csvParseUnique(traitsText, 6),
        values: csvParseUnique(valuesText, 5),
      },
      physical: {
        ...src.physical,
        distinctive_features: csvParseUnique(featuresText, 6),
      },
    };
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
        draft: serializeForServer(form), // keep assistant in sync with current arrays & slug
        thread: threadForAssistant,
      });

      // append assistant reply
      if (res?.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.message }]);
      }

      // apply server-validated draft
      if (res?.draft) {
        setForm(res.draft as CharacterDefinitionLite);
        setTraitsText((res.draft.personality?.traits ?? []).join(", "));
        setValuesText((res.draft.personality?.values ?? []).join(", "));
        setFeaturesText((res.draft.physical?.distinctive_features ?? []).join(", "));
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
    setValuesText((next.personality.values ?? []).join(", "));
    setFeaturesText((next.physical.distinctive_features ?? []).join(", "));
  }

  // ────────────── UI ──────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
      {/* Chat / Guidance */}
      <Card className="border rounded-2xl shadow-sm">
        <CardContent className="p-4 flex flex-col h-[70dvh]">
          <div
            ref={chatRef}
            className="flex-1 overflow-auto space-y-3 pb-[100px]"
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
            <CharacterForm
              value={form}
              onChange={onFormChange}
              traitsText={traitsText}
              onTraitsTextChange={applyTraitsTextToForm}
              valuesText={valuesText}
              onValuesTextChange={applyValuesTextToForm}
              featuresText={featuresText}
              onFeaturesTextChange={applyFeaturesTextToForm}
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => mValidate.mutate(serializeForServer(form))}
                disabled={mValidate.isPending}
              >
                {mValidate.isPending ? "Validating…" : "Validate"}
              </Button>

              <Button
                type="button"
                onClick={() => mCommit.mutate(serializeForServer(form))}
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
