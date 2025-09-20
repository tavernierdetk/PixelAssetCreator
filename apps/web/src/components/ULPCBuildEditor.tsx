// apps/web/src/components/ULPCBuildEditor.tsx
import React, { useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ulpc } from "@pixelart/schemas";
import type { UlpcSheetCatalog, UlpcSheetItem, ComposeWarning } from "@/lib/api";

// Types
export type BuildJson = any;

type Props = {
  value: BuildJson;
  onChange: (next: BuildJson) => void;
  sheetCatalog?: UlpcSheetCatalog | null;
  warnings?: ComposeWarning[];
};

// ───── schema helpers ─────
const ULPC_ENUM_SCHEMA = (ulpc as any).build;
const CATEGORY_REFERENCE = (ulpc as any).category_reference;

const FALLBACK_ANIMS = [
  "idle","walk","run","slash","thrust","shoot","hurt","jump","sit","emote","climb","combat",
] as const;

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
  return Array.isArray(en) ? (en as string[]) : [...FALLBACK_ANIMS];
}
const BODY_TYPES = ["male", "muscular", "female", "teen", "child"] as const;
const isBodyCat = (cat?: string) => typeof cat === "string" && /^body\//.test(cat);
const isHeadCat = (cat?: string) => typeof cat === "string" && /^head\//.test(cat);
const isBodyOrHead = (cat?: string) => isBodyCat(cat) || isHeadCat(cat);
const bodyCategoryFor = (t: string) => `body/bodies/${t}`;
const defaultHeadCategoryFor = (t: string) => `head/heads/human/${t}`;
const lastSeg = (p: string) => {
  const parts = (p || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

const BODY_KEY_PRIORITY: Record<string, string[]> = {
  male: ["male", "adult"],
  muscular: ["muscular", "male", "adult"],
  female: ["female", "adult"],
  teen: ["teen", "adult"],
  child: ["child"],
};

const normalizeSheetPath = (p: string): string => p.replace(/^\/+|\/+$/g, "");

function resolvePathForBody(item: UlpcSheetItem, bodyType: string): string | null {
  const keys = BODY_KEY_PRIORITY[bodyType] ?? [bodyType];
  for (const key of keys) {
    const raw = item.layerPaths?.[key];
    if (typeof raw === "string" && raw.trim()) {
      return normalizeSheetPath(raw.trim());
    }
  }
  return null;
}

function findItemByCategoryPath(
  catalog: UlpcSheetCatalog | null | undefined,
  categoryPath: string
): { category: string; item: UlpcSheetItem; path: string } | null {
  if (!catalog) return null;
  const normalized = normalizeSheetPath(categoryPath ?? "");
  for (const entry of catalog.categories ?? []) {
    for (const item of entry.items ?? []) {
      const layerPaths = item.layerPaths ?? {};
      for (const raw of Object.values(layerPaths)) {
        if (typeof raw !== "string") continue;
        if (normalizeSheetPath(raw) === normalized) {
          return { category: entry.category, item, path: normalizeSheetPath(raw) };
        }
      }
    }
  }
  return null;
}

// ───── base state normalization ─────
function normalizeBuild(value: BuildJson): BuildJson {
  const b = value && typeof value === "object" ? value : {};
  return {
    schema: "ulpc.build/1.0",
    generator: { project: "Universal-LPC-Spritesheet-Character-Generator", version: "local" },
    animations: Array.isArray(b.animations) ? b.animations : ["idle"],
    output: typeof b.output === "object" ? b.output : { mode: "full" },
    layers: Array.isArray(b.layers) ? b.layers : [],
    ...b,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ULPCControls: Animations + Output + Body&Head
// ────────────────────────────────────────────────────────────────────────────
export function ULPCControls({ value, onChange }: Props): JSX.Element {
  const build = useMemo(() => normalizeBuild(value), [value]);
  const categories = useMemo(() => getAllCategories(), []);
  const animEnum = useMemo(() => getAnimationEnum(), []);

  const bodyIdx = (build.layers ?? []).findIndex((l: any) => isBodyCat(l?.category));
  const headIdx = (build.layers ?? []).findIndex((l: any) => isHeadCat(l?.category));
  const bodyLayer = bodyIdx >= 0 ? build.layers[bodyIdx] : null;
  const headLayer = headIdx >= 0 ? build.layers[headIdx] : null;
  const bodyType = bodyLayer ? lastSeg(bodyLayer.category) : "male";
  const bodyVariants = useMemo(() => getVariantsForCategory(bodyCategoryFor(bodyType)), [bodyType]);

  const headChoices = useMemo(() => {
    const list = categories.filter((c) => c.startsWith("head/") && c.endsWith(`/${bodyType}`));
    return list.length ? list : [defaultHeadCategoryFor(bodyType)];
  }, [categories, bodyType]);

  // seed body/head once if empty
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

  function changeAnimations(anims: string[]) {
    onChange({ ...build, animations: anims });
  }
  function changeOutputMode(mode: string) {
    onChange({ ...build, output: { ...(build.output ?? {}), mode } });
  }
  function changeFrameSize(w: number | "", h: number | "") {
    const output = { ...(build.output ?? {}) };
    if (w && h) (output as any).frame_size = { w, h };
    else if ("frame_size" in output) delete (output as any).frame_size;
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
      const bType = lastSeg((b as any).category);
      h = { category: defaultHeadCategoryFor(bType), variant: (b as any).variant };
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
    if (hIdx >= 0) next[hIdx] = { ...next[hIdx], variant: v };
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
                  className={`px-2 py-1 rounded-xl border text-sm ${on ? "bg-slate-900 text-white" : "bg-white"}`}
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
                {/* Keep values aligned to your slicer */}
                {["full", "split_by_animation", "split_by_frame", "both"].map((m) => (
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
                    changeFrameSize(e.target.value ? Number(e.target.value) : "", build.output?.frame_size?.h ?? "")
                  }
                />
                <Input
                  placeholder="h"
                  value={build.output?.frame_size?.h ?? ""}
                  onChange={(e) =>
                    changeFrameSize(build.output?.frame_size?.w ?? "", e.target.value ? Number(e.target.value) : "")
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
                {!headChoices.includes(defaultHeadCategoryFor(bodyType)) && (
                  <option value={defaultHeadCategoryFor(bodyType)}>{defaultHeadCategoryFor(bodyType)}</option>
                )}
              </select>
              <div className="text-xs text-slate-500 mt-1">Head color is locked to the body color.</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
export function ULPCLayers({ value, onChange, sheetCatalog, warnings }: Props): JSX.Element {
  const build = useMemo(() => normalizeBuild(value), [value]);
  const enumCategories = useMemo(() => getAllCategories(), []);
  const catalogEntries = sheetCatalog?.categories ?? [];
  const selectableEnumCategories = useMemo(
    () => enumCategories.filter((c) => !isBodyOrHead(c)),
    [enumCategories]
  );

  const warningMap = useMemo(() => {
    const map = new Map<string, ComposeWarning[]>();
    const entries = warnings ?? [];
    for (const warn of entries) {
      if (!warn?.category) continue;
      const key = `${warn.category}::${warn.variant ?? ""}`;
      const arr = map.get(key) ?? [];
      arr.push(warn);
      map.set(key, arr);
    }
    return map;
  }, [warnings]);

  const bodyLayer = (build.layers ?? []).find((l: any) => isBodyCat(l?.category));
  const bodyType = bodyLayer ? lastSeg(bodyLayer.category) : "male";
  const bodyVariant = bodyLayer?.variant ?? "light";

  const catalogStructure = useMemo(() => {
    if (!catalogEntries.length) return [] as Array<{ category: string; items: Array<{ item: UlpcSheetItem; path: string }> }>;

    const out: Array<{ category: string; items: Array<{ item: UlpcSheetItem; path: string }> }> = [];
    for (const entry of catalogEntries) {
      if (isBodyOrHead(entry.category)) continue;
      const items: Array<{ item: UlpcSheetItem; path: string }> = [];
      for (const item of entry.items ?? []) {
        const path = resolvePathForBody(item, bodyType);
        if (path) items.push({ item, path });
      }
      if (items.length) {
        out.push({ category: entry.category, items });
      }
    }
    out.sort((a, b) => a.category.localeCompare(b.category));
    return out;
  }, [catalogEntries, bodyType]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Array<{ item: UlpcSheetItem; path: string }>>();
    for (const entry of catalogStructure) {
      map.set(entry.category, entry.items);
    }
    return map;
  }, [catalogStructure]);

  const categoryNames = useMemo(() => catalogStructure.map((entry) => entry.category), [catalogStructure]);
  const hasCatalog = catalogStructure.length > 0;

  function addLayerLegacy() {
    const ref: Array<{ category: string; items: string[] }> = Array.isArray(CATEGORY_REFERENCE)
      ? (CATEGORY_REFERENCE as any)
      : [];
    const preferredOrder = ref.map((x) => x.category).filter((c) => !isBodyOrHead(c));
    const firstCat =
      preferredOrder.find((c) => !(build.layers ?? []).some((l: any) => l.category === c)) ||
      selectableEnumCategories[0] ||
      enumCategories[0] ||
      "clothes/shirts/adult";
    const firstVar = getVariantsForCategory(firstCat)[0] ?? "default";
    onChange({ ...build, layers: [...(build.layers ?? []), { category: firstCat, variant: firstVar }] });
  }

  function addLayerCatalog() {
    for (const entry of catalogStructure) {
      const items = entry.items ?? [];
      if (!items.length) continue;
      const { item, path } = items[0];
      const variants = Array.isArray(item.variants) ? item.variants : [];
      const variant = variants[0] ?? bodyVariant ?? ((build.layers ?? [])[0]?.variant ?? "base");
      onChange({
        ...build,
        layers: [...(build.layers ?? []), { category: path, variant }],
      });
      return;
    }
    addLayerLegacy();
  }

  function removeLayer(i: number) {
    const L = (build.layers ?? [])[i];
    if (isBodyCat(L?.category) || isHeadCat(L?.category)) return;
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

  function changeLayerCategoryLegacy(i: number, category: string) {
    if (!category) return;
    const next = [...(build.layers ?? [])];
    const v0 = getVariantsForCategory(category)[0] ?? next[i]?.variant ?? "default";
    next[i] = { ...next[i], category, variant: v0 };
    onChange({ ...build, layers: next });
  }

  function changeLayerVariant(index: number, variant: string) {
    const next = [...(build.layers ?? [])];
    next[index] = { ...next[index], variant };
    onChange({ ...build, layers: next });
  }

  function setLayerFromItem(index: number, item: UlpcSheetItem) {
    const path = resolvePathForBody(item, bodyType);
    if (!path) return;
    const next = [...(build.layers ?? [])];
    const current = next[index] ?? {};
    const variants = Array.isArray(item.variants) ? item.variants : [];
    let variant = current.variant ?? bodyVariant ?? "base";
    if (variants.length && !variants.includes(variant)) {
      variant = variants[0];
    }
    next[index] = { ...current, category: path, variant };
    onChange({ ...build, layers: next });
  }

  function handleCategoryChange(index: number, categoryName: string) {
    if (!categoryName) return;
    const items = categoryMap.get(categoryName) ?? [];
    if (!items.length) return;
    setLayerFromItem(index, items[0].item);
  }

  function handleItemChange(index: number, categoryName: string, itemId: string) {
    const items = categoryMap.get(categoryName) ?? [];
    const entry = items.find((it) => it.item.id === itemId);
    if (!entry) return;
    setLayerFromItem(index, entry.item);
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Layers</div>
          <Button
            type="button"
            onClick={hasCatalog ? addLayerCatalog : addLayerLegacy}
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={hasCatalog ? !categoryNames.length : selectableEnumCategories.length === 0}
          >
            + Add Layer
          </Button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[760px] space-y-2">
            {(build.layers ?? []).map((layer: any, index: number) => {
              const categoryPath = layer?.category ?? "";
              if (isBodyCat(categoryPath) || isHeadCat(categoryPath)) return null;

              const warningKey = `${categoryPath}::${layer?.variant ?? ""}`;
              const rowWarnings = warningMap.get(warningKey) ?? [];

              if (!hasCatalog) {
                const variants = getVariantsForCategory(categoryPath);
                return (
                  <div
                    key={index}
                    className={`rounded-xl border p-3 ${rowWarnings.length ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="grid items-center gap-2 grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto_auto]">
                      <select
                        className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                        value={categoryPath}
                        onChange={(e) => changeLayerCategoryLegacy(index, e.target.value)}
                      >
                        <option value="">Select category…</option>
                        {selectableEnumCategories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>

                      <select
                        className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                        value={layer?.variant ?? ""}
                        onChange={(e) => changeLayerVariant(index, e.target.value)}
                      >
                        {variants.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>

                      <div className="flex gap-1">
                        <Button
                          type="button"
                          onClick={() => moveLayer(index, -1)}
                          disabled={index === 0}
                          className="w-8 h-8 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          onClick={() => moveLayer(index, +1)}
                          disabled={index === (build.layers?.length ?? 0) - 1}
                          className="w-8 h-8 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          ↓
                        </Button>
                      </div>

                      <Button
                        type="button"
                        onClick={() => removeLayer(index)}
                        className="bg-red-600 text-white hover:bg-red-700"
                      >
                        Remove
                      </Button>
                    </div>
                    {rowWarnings.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-amber-800">
                        {rowWarnings.map((warn, idx) => (
                          <li key={idx}>
                            ⚠️ {warn.reason.replace(/_/g, " ")}{warn.detail ? ` – ${warn.detail}` : ""}
                            {warn.animation ? ` (animation: ${warn.animation})` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              }

              const match = findItemByCategoryPath(sheetCatalog ?? null, categoryPath);
              const selectedCategory = match?.category ?? "";
              const availableItems = selectedCategory ? categoryMap.get(selectedCategory) ?? [] : [];
              const selectedItemId = match?.item?.id ?? "";
              const selectedItem = availableItems.find((entry) => entry.item.id === selectedItemId)?.item ?? null;
              const variantOptions = selectedItem && Array.isArray(selectedItem.variants)
                ? selectedItem.variants
                : [];
              const variantChoices = variantOptions.length
                ? variantOptions
                : Array.from(new Set([layer?.variant].filter(Boolean)));

              return (
                <div
                  key={index}
                  className={`rounded-xl border p-3 ${rowWarnings.length ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="grid items-center gap-2 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,12rem)_auto_auto]">
                    <select
                      className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                      value={selectedCategory}
                      onChange={(e) => handleCategoryChange(index, e.target.value)}
                    >
                      <option value="">Select category…</option>
                      {categoryNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                      value={selectedItemId}
                      onChange={(e) => handleItemChange(index, selectedCategory, e.target.value)}
                      disabled={!selectedCategory}
                    >
                      <option value="">Select item…</option>
                      {availableItems.map(({ item }) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm"
                      value={layer?.variant ?? ""}
                      onChange={(e) => changeLayerVariant(index, e.target.value)}
                      disabled={!selectedItem}
                    >
                      {variantChoices.length === 0 && <option value="">(no variants)</option>}
                      {variantChoices.map((variant) => (
                        <option key={variant} value={variant}>
                          {variant}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-1">
                      <Button
                        type="button"
                        onClick={() => moveLayer(index, -1)}
                        disabled={index === 0}
                        className="w-8 h-8 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        onClick={() => moveLayer(index, +1)}
                        disabled={index === (build.layers?.length ?? 0) - 1}
                        className="w-8 h-8 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        ↓
                      </Button>
                    </div>

                    <Button
                      type="button"
                      onClick={() => removeLayer(index)}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                  {rowWarnings.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-amber-800">
                      {rowWarnings.map((warn, idx) => (
                        <li key={idx}>
                          ⚠️ {warn.reason.replace(/_/g, " ")}{warn.detail ? ` – ${warn.detail}` : ""}
                          {warn.animation ? ` (animation: ${warn.animation})` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Default export: keeps backwards compatibility (stacked controls + layers)
// ────────────────────────────────────────────────────────────────────────────
export default function ULPCBuildEditor({ value, onChange, sheetCatalog, warnings }: Props): JSX.Element {
  return (
    <div className="space-y-4">
      <ULPCControls value={value} onChange={onChange} sheetCatalog={sheetCatalog} />
      <ULPCLayers value={value} onChange={onChange} sheetCatalog={sheetCatalog} warnings={warnings} />
    </div>
  );
}
