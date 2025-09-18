// apps/web/src/components/ULPCBuildEditor.tsx
import React, { useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

import { ulpc } from "@pixelart/schemas";

// Pull schema + category reference from the ulpc namespace
const ULPC_ENUM_SCHEMA = (ulpc as any).build;
const CATEGORY_REFERENCE = (ulpc as any).category_reference;

type BuildJson = any;

type Props = {
  value: BuildJson;
  onChange: (next: BuildJson) => void;
};

// ───────────────── helpers ─────────────────
const FALLBACK_ANIMS = [
  "idle",
  "walk",
  "run",
  "slash",
  "thrust",
  "shoot",
  "hurt",
  "jump",
  "sit",
  "emote",
  "climb",
  "combat",
];

function getAllCategories(): string[] {
  const arr = (ULPC_ENUM_SCHEMA as any)?.$defs?.category_enum?.enum;
  return Array.isArray(arr) ? (arr as string[]) : [];
}
function getVariantsForCategory(category: string): string[] {
  const oneOf: any[] =
    ((ULPC_ENUM_SCHEMA as any)?.$defs?.variant_enum_switch?.oneOf as any[]) || [];
  const hit = oneOf.find((b) => b?.if?.properties?.category?.const === category);
  const en = hit?.then?.properties?.variant?.enum;
  return Array.isArray(en) ? (en as string[]) : [];
}
function getAnimationEnum(): string[] {
  const en = (ULPC_ENUM_SCHEMA as any)?.properties?.animations?.items?.enum;
  return Array.isArray(en) ? (en as string[]) : FALLBACK_ANIMS;
}
const BODY_TYPES = ["male", "muscular", "female", "teen", "child"] as const;
const isBodyCat = (cat?: string) => typeof cat === "string" && /^body\//.test(cat);
const isHeadCat = (cat?: string) => typeof cat === "string" && /^head\//.test(cat);
const bodyCategoryFor = (t: string) => `body/bodies/${t}`;
const defaultHeadCategoryFor = (t: string) => `head/heads/human/${t}`;
const lastSeg = (p: string) => {
  const parts = (p || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

// ───────────────── component ─────────────────
export default function ULPCBuildEditor({ value, onChange }: Props): JSX.Element {
  const categories = useMemo(() => getAllCategories(), []);
  const animEnum = useMemo(() => getAnimationEnum(), []);

  // Controlled + visible defaults
  const build: BuildJson = useMemo(() => {
    const b = value && typeof value === "object" ? value : {};
    return {
      schema: "ulpc.build/1.0",
      generator: {
        project: "Universal-LPC-Spritesheet-Character-Generator",
        version: "local",
      },
      animations: Array.isArray(b.animations) ? b.animations : ["idle"],
      output: typeof b.output === "object" ? b.output : { mode: "full" },
      layers: Array.isArray(b.layers) ? b.layers : [],
      ...b,
    };
  }, [value]);

  // Locate body/head
  const bodyIdx = (build.layers ?? []).findIndex((l: any) => isBodyCat(l?.category));
  const headIdx = (build.layers ?? []).findIndex((l: any) => isHeadCat(l?.category));
  const bodyLayer = bodyIdx >= 0 ? build.layers[bodyIdx] : null;
  const headLayer = headIdx >= 0 ? build.layers[headIdx] : null;
  const bodyType = bodyLayer ? lastSeg(bodyLayer.category) : "male";
  const bodyVariants = useMemo(
    () => getVariantsForCategory(bodyCategoryFor(bodyType)),
    [bodyType]
  );

  const headChoices = useMemo(() => {
    const list = categories.filter(
      (c) => c.startsWith("head/") && c.endsWith(`/${bodyType}`)
    );
    return list.length ? list : [defaultHeadCategoryFor(bodyType)];
  }, [categories, bodyType]);

  // Seed body/head once if empty
  useEffect(() => {
    if (!build.layers || build.layers.length === 0) {
      const bCat = bodyCategoryFor("male");
      const bVar = getVariantsForCategory(bCat)[0] ?? "light";
      const b = { category: bCat, variant: bVar };
      const h = { category: defaultHeadCategoryFor("male"), variant: bVar };
      onChange({ ...build, layers: [b, h] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───── change helpers ─────
  function changeAnimations(anims: string[]) {
    onChange({ ...build, animations: anims });
  }
  function changeOutputMode(mode: string) {
    onChange({ ...build, output: { ...(build.output ?? {}), mode } });
  }
  function changeFrameSize(w: number | "", h: number | "") {
    const output = { ...(build.output ?? {}) };
    if (w && h) {
      (output as any).frame_size = { w, h };
    } else {
      if (output && "frame_size" in output) delete (output as any).frame_size;
    }
    onChange({ ...build, output });
  }
  function ensureBodyHeadExist() {
    let next = [...(build.layers ?? [])];
    let b = next.find((l) => isBodyCat(l?.category));
    let h = next.find((l) => isHeadCat(l?.category));
    if (!b) {
      const bCat = bodyCategoryFor("male");
      const bVar = getVariantsForCategory(bCat)[0] ?? "light";
      b = { category: bCat, variant: bVar };
      next = [b, ...next];
    }
    if (!h) {
      const bType = lastSeg(b!.category);
      h = { category: defaultHeadCategoryFor(bType), variant: b!.variant };
      next = [...next, h];
    }
    if (next !== build.layers) onChange({ ...build, layers: next });
  }
  function changeBodyType(nextType: string) {
    ensureBodyHeadExist();
    const next = [...build.layers];
    const bIdx = next.findIndex((l: any) => isBodyCat(l?.category));
    const hIdx = next.findIndex((l: any) => isHeadCat(l?.category));
    const newBodyCat = bodyCategoryFor(nextType);
    const newBodyVar = getVariantsForCategory(newBodyCat)[0] ?? (bodyLayer?.variant ?? "light");
    if (bIdx >= 0) next[bIdx] = { ...next[bIdx], category: newBodyCat, variant: newBodyVar };
    const newHeadCat =
      headChoices.find((c) => c.endsWith(`/${nextType}`)) ?? defaultHeadCategoryFor(nextType);
    if (hIdx >= 0) next[hIdx] = { ...next[hIdx], category: newHeadCat, variant: newBodyVar };
    onChange({ ...build, layers: next });
  }
  function changeBodyVariant(v: string) {
    ensureBodyHeadExist();
    const next = [...build.layers];
    const bIdx = next.findIndex((l: any) => isBodyCat(l?.category));
    const hIdx = next.findIndex((l: any) => isHeadCat(l?.category));
    if (bIdx >= 0) next[bIdx] = { ...next[bIdx], variant: v };
    if (hIdx >= 0) next[hIdx] = { ...next[hIdx], variant: v }; // lock head to body color
    onChange({ ...build, layers: next });
  }
  function changeHeadCategory(cat: string) {
    ensureBodyHeadExist();
    const next = [...build.layers];
    const hIdx = next.findIndex((l: any) => isHeadCat(l?.category));
    const bodyVar = next.find((l: any) => isBodyCat(l?.category))?.variant ?? "light";
    if (hIdx >= 0) next[hIdx] = { ...next[hIdx], category: cat, variant: bodyVar };
    onChange({ ...build, layers: next });
  }
  function addLayer() {
    const ref: Array<{ category: string; items: string[] }> = Array.isArray(CATEGORY_REFERENCE)
      ? (CATEGORY_REFERENCE as any)
      : [];
    const preferredOrder = ref
      .map((x) => x.category)
      .filter((c) => !isBodyCat(c) && !isHeadCat(c));
    const firstCat =
      preferredOrder.find((c) => !(build.layers ?? []).some((l: any) => l.category === c)) ||
      categories[0] ||
      "clothes/shirts/adult";
    const firstVar = getVariantsForCategory(firstCat)[0] ?? "default";
    onChange({
      ...build,
      layers: [...(build.layers ?? []), { category: firstCat, variant: firstVar }],
    });
  }
  function removeLayer(i: number) {
    const L = (build.layers ?? [])[i];
    if (isBodyCat(L?.category) || isHeadCat(L?.category)) return; // keep body/head in v1
    const next = (build.layers ?? []).filter((_: any, idx: number) => idx !== i);
    onChange({ ...build, layers: next });
  }
  function moveLayer(i: number, dir: -1 | 1) {
    const src = [...(build.layers ?? [])];
    const j = i + dir;
    if (j < 0 || j >= src.length) return;
    const [row] = src.splice(i, 1);
    src.splice(j, 0, row);
    onChange({ ...build, layers: src });
  }
  function changeLayerCategory(i: number, cat: string) {
    const next = [...(build.layers ?? [])];
    const v0 = getVariantsForCategory(cat)[0] ?? next[i]?.variant ?? "default";
    next[i] = { ...next[i], category: cat, variant: v0 };
    onChange({ ...build, layers: next });
  }
  function changeLayerVariant(i: number, v: string) {
    const next = [...(build.layers ?? [])];
    next[i] = { ...next[i], variant: v };
    onChange({ ...build, layers: next });
  }

  // ───────────────── UI ─────────────────
  return (
    <div className="space-y-4">
      {/* Animations */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <Label>Animations</Label>
          <div className="flex flex-wrap gap-2">
            {animEnum.map((name) => {
              const on = (build.animations ?? []).includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={`px-2 py-1 rounded-xl border text-sm ${
                    on ? "bg-slate-900 text-white" : "bg-white"
                  }`}
                  onClick={() => {
                    const set = new Set<string>((build.animations ?? []) as string[]);
                    if (on) set.delete(name);
                    else set.add(name);
                    changeAnimations(Array.from(set));
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Output */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="out_mode">Output Mode</Label>
              <select
                id="out_mode"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={build.output?.mode ?? "full"}
                onChange={(e) => changeOutputMode(e.target.value)}
              >
                {/* Match schema enum exactly to avoid validator errors */}
                {["full", "split_by_animation", "split_by_item", "split_both"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Frame Size (w × h)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="w"
                  value={build.output?.frame_size?.w ?? ""}
                  onChange={(e) =>
                    changeFrameSize(
                      e.target.value ? Number(e.target.value) : "",
                      build.output?.frame_size?.h ?? ""
                    )
                  }
                />
                <Input
                  placeholder="h"
                  value={build.output?.frame_size?.h ?? ""}
                  onChange={(e) =>
                    changeFrameSize(
                      build.output?.frame_size?.w ?? "",
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">Leave empty to auto-detect.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Body & Head */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>Body Type</Label>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={bodyType}
                onChange={(e) => changeBodyType(e.target.value)}
              >
                {BODY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Body Color</Label>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={bodyLayer?.variant ?? ""}
                onChange={(e) => changeBodyVariant(e.target.value)}
              >
                {bodyVariants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Head Type (category)</Label>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={headLayer?.category ?? defaultHeadCategoryFor(bodyType)}
                onChange={(e) => changeHeadCategory(e.target.value)}
              >
                {headChoices.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {/* Fallback to default if not present in enum list */}
                {!headChoices.includes(defaultHeadCategoryFor(bodyType)) && (
                  <option value={defaultHeadCategoryFor(bodyType)}>
                    {defaultHeadCategoryFor(bodyType)}
                  </option>
                )}
              </select>
              <div className="text-xs text-slate-500 mt-1">
                Head color is locked to the body color.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Layers */}
<Card>
  <CardContent className="p-3 space-y-3">
    <div className="flex items-center justify-between">
      <div className="font-medium">Layers</div>
      <Button
        type="button"
        onClick={addLayer}
        className="bg-slate-900 text-white hover:bg-slate-800"
      >
        + Add Layer
      </Button>
    </div>

    {/* prevent bleed: make horizontal scrollable if needed */}
    <div className="overflow-x-auto">
      {/* keep row content from collapsing too tightly on tiny screens */}
      <div className="min-w-[640px] space-y-2">
        {(build.layers ?? []).map((L: any, i: number) => {
          const cat = L?.category ?? "";
          const variants = getVariantsForCategory(cat);
          const isBody = isBodyCat(cat);
          const isHead = isHeadCat(cat);
          const canRemove = !(isBody || isHead);

          return (
            <div
              key={i}
              className="
                grid items-center gap-2
                grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto_auto]
              "
            >
              {/* Category */}
              <select
                className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                value={cat}
                onChange={(e) => changeLayerCategory(i, e.target.value)}
                disabled={isBody || isHead}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Variant */}
              <select
                className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                value={L?.variant ?? ""}
                onChange={(e) => changeLayerVariant(i, e.target.value)}
                disabled={isHead} // head variant locked to body
              >
                {variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>

              {/* Move */}
              <div className="flex gap-1">
                <Button
                  type="button"
                  onClick={() => moveLayer(i, -1)}
                  disabled={i === 0}
                  className="w-8 h-8 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  onClick={() => moveLayer(i, +1)}
                  disabled={i === build.layers.length - 1}
                  className="w-8 h-8 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  ↓
                </Button>
              </div>

              {/* Remove (hidden for required body/head) */}
              {canRemove ? (
                <Button
                  type="button"
                  onClick={() => removeLayer(i)}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Remove
                </Button>
              ) : (
                <div /> /* keep grid alignment */
              )}
            </div>
          );
        })}
      </div>
    </div>
  </CardContent>
</Card>
    </div>
  );
}
