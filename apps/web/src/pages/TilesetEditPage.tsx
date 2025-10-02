// apps/web/src/pages/TilesetEditPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { BackHeader } from "@/components/BackHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  API,
  getTilesetMeta,
  getPatterns,
  listTilesetAssets,
  tilesetFileUrl,
  generateTile,
  stitchTileset,
  cropTile,
  getProjectSettings,
  updateTilesetMeta,
  exportTilesetGodot,
  uploadTilesetTexture,
  deleteTilesetTexture,
  generateTilesetTexture,
} from "@/lib/api";

type PatternInfo = {
  id: string;
  displayName: string;
  tileSize: number;
  grid: { cols: number; rows: number };
  slots: number;
  docs?: string;
};

type TileSpec = { id: number; name: string; prompt: string };

function tileKey(r: number, c: number) {
  return `r${String(r).padStart(2, "0")}_c${String(c).padStart(2, "0")}`;
}
function tileRelPath(pattern: string, r: number, c: number) {
  return `tiles/${pattern}_${tileKey(r, c)}.png`;
}

function oneline(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function buildFullPrompt(user: string, ctx: { preamble?: string; tileInstruction?: string; palette?: string }) {
  const parts = [
    ctx.preamble ? `[Preamble] ${oneline(ctx.preamble)}` : "",
    ctx.tileInstruction ? `[Slot] ${oneline(ctx.tileInstruction)}` : "",
    ctx.palette ? `Palette: ${ctx.palette}.` : "",
    user && user.trim() ? user.trim() : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function Modal(props: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-4xl max-h-[90vh] overflow-auto rounded-xl bg-white shadow-xl border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-medium">{props.title ?? "Editor"}</div>
          <button className="text-sm underline" onClick={props.onClose}>Close</button>
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

function TilesetSectionsEditor(props: {
  materials: string;
  palette: string;
  iface: string;
  materialAName: string;
  materialBName: string;
  setMaterials: (v: string) => void;
  setPalette: (v: string) => void;
  setIface: (v: string) => void;
  setMaterialAName: (v: string) => void;
  setMaterialBName: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="font-medium">Tileset Prompt Sections</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Material A (name)</label>
            <Input value={props.materialAName} onChange={(e) => props.setMaterialAName(e.target.value)} placeholder="Land" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Material B (name)</label>
            <Input value={props.materialBName} onChange={(e) => props.setMaterialBName(e.target.value)} placeholder="Water" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-600">[MATERIALS]</label>
          <textarea className="w-full border rounded p-2 text-sm min-h-[72px]" value={props.materials} onChange={(e) => props.setMaterials(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-600">[PALETTE]</label>
          <textarea className="w-full border rounded p-2 text-sm min-h-[72px]" value={props.palette} onChange={(e) => props.setPalette(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-600">[INTERFACE]</label>
          <textarea className="w-full border rounded p-2 text-sm min-h-[72px]" value={props.iface} onChange={(e) => props.setIface(e.target.value)} />
        </div>
        <div>
          <Button onClick={props.onSave} disabled={props.saving} className="border bg-white hover:bg-slate-50">
            {props.saving ? "Saving…" : "Save Sections"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TileControls(props: {
  selected: { r: number; c: number } | null;
  slotName: string;
  fullPrompt: string;
  onEditFinalPrompt: (text: string) => void;
  userPrompt: string;
  setUserPrompt: (v: string) => void;
  onGenerate: () => void;
  genPending: boolean;
  onOpenModal: () => void;
  latestUrl: string | null;
  crop: { x: number; y: number; w: number; h: number };
  setCrop: (c: { x: number; y: number; w: number; h: number }) => void;
  onCrop: () => void;
  cropPending: boolean;
  genError: string | null;
  filePath: string | null;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="font-medium">Tile Controls</div>
        {!props.selected ? (
          <p className="text-sm text-slate-600">Click a cell to select it. The prompt will appear here.</p>
        ) : (
          <>
            <div className="text-xs text-slate-600">
              Selected cell: <code>r{props.selected.r} c{props.selected.c}</code>
              {props.filePath ? (
                <>
                  {" "}• File: <code>{props.filePath}</code>
                </>
              ) : null}
            </div>
            <div className="text-xs">
              Slot: <span className="font-medium">{props.slotName || "—"}</span>
            </div>

            {/* Optional user hint */}
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Optional hint (appended after [OUTPUT])</label>
              <textarea
                className="w-full border rounded p-2 text-sm min-h-[72px]"
                value={props.userPrompt}
                onChange={(e) => props.setUserPrompt(e.target.value)}
                placeholder="Short extra hint (optional)…"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-600">Final prompt (v2)</label>
              <textarea
                className="w-full border rounded p-2 text-xs min-h-[160px] font-mono"
                value={props.fullPrompt}
                onChange={(e) => props.onEditFinalPrompt(e.target.value)}
              />
              <div className="text-[11px] text-slate-500">This exact text is sent to the generator.</div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={props.onGenerate} disabled={props.genPending || !props.selected}>
                {props.genPending ? "Generating…" : "Generate"}
              </Button>
              <Button onClick={props.onOpenModal} className="border bg-white hover:bg-slate-50">
                Open Modal
              </Button>
              {props.genError ? <span className="text-xs text-red-600">{props.genError}</span> : null}
            </div>

            {props.latestUrl && (
              <div>
                <div className="text-xs text-slate-600 mb-1">Latest result</div>
                <div className="inline-block bg-checker p-0.5 border rounded">
                  <img src={props.latestUrl} className="w-32 h-32 image-render-pixel block" alt="" />
                </div>
              </div>
            )}

            {/* Crop controls */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <div className="text-[11px] text-slate-600 mb-1">x</div>
                <Input type="number" value={props.crop.x} onChange={(e) => props.setCrop({ ...props.crop, x: +e.target.value })} />
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">y</div>
                <Input type="number" value={props.crop.y} onChange={(e) => props.setCrop({ ...props.crop, y: +e.target.value })} />
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">w</div>
                <Input type="number" value={props.crop.w} onChange={(e) => props.setCrop({ ...props.crop, w: +e.target.value })} />
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">h</div>
                <Input type="number" value={props.crop.h} onChange={(e) => props.setCrop({ ...props.crop, h: +e.target.value })} />
              </div>
              <div className="col-span-4">
                <Button onClick={props.onCrop} disabled={props.cropPending || !props.selected} className="border bg-white hover:bg-slate-50">
                  {props.cropPending ? "Cropping…" : "Crop & Save"}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function TilesetEditPage() {
  const nav = useNavigate();
  const { slug = "" } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [imgBust, setImgBust] = useState(0);

  // Data
  const metaQ = useQuery({ queryKey: ["tilesetMeta", slug], queryFn: () => getTilesetMeta(slug), enabled: !!slug });
  const patternsQ = useQuery({ queryKey: ["tilesetPatterns"], queryFn: getPatterns });
  const assetsQ = useQuery({ queryKey: ["tilesetAssets", slug], queryFn: () => listTilesetAssets(slug), enabled: !!slug });
  const projectQ = useQuery({ queryKey: ["projectSettings"], queryFn: getProjectSettings });

  // Tilespecs (names + per-slot prompts) — we will map grid cells row-major to this array
  const tilespecsQ = useQuery({
    queryKey: ["tilespecs", slug],
    queryFn: async (): Promise<{ pattern: string; preamble: string; tiles: TileSpec[] }> => {
      const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/tilespecs`, { cache: "no-store" });
      if (!r.ok) throw new Error(`tilespecs ${r.status}`);
      const x = await r.json();
      return { pattern: x.pattern, preamble: x.preamble ?? "", tiles: (x.tiles ?? []) as TileSpec[] };
    },
    enabled: !!slug,
  });

  // Pattern + palette
  const patternId = metaQ.data?.pattern ?? "blob47";
  const paletteName = metaQ.data?.palette as string | undefined;
  const tilesetMaterials = metaQ.data?.materials_text ?? "";
  const tilesetPaletteText = metaQ.data?.palette_text ?? "";
  const tilesetInterface = metaQ.data?.interface_text ?? "";
  const materialsAB = (metaQ.data as any)?.materials_ab as { A?: { name?: string; vehicles?: string[] }; B?: { name?: string; vehicles?: string[] } } | undefined;

  const patternInfo: PatternInfo = useMemo(
    () =>
      patternsQ.data?.find((p) => p.id === patternId) ?? {
        id: patternId,
        displayName: "Blob 47 (8×6)",
        tileSize: 32,
        grid: { cols: 8, rows: 6 },
        slots: 47,
      },
    [patternsQ.data, patternId]
  );

  const files = assetsQ.data?.files ?? [];
  const cols = patternInfo.grid.cols;
  const rows = patternInfo.grid.rows;
  const tileSizePx = patternInfo.tileSize * 2; // 2× UI scale

  // Resolve preview file for a given grid cell
  function tilePreviewRel(r: number, c: number): string | null {
    // Primary (manual route)
    const primary = tileRelPath(patternId, r, c);
    if (files.includes(primary)) return primary;
    // Coast16 procedural fallback: tiles_32/NN_...._32.png where NN is row-major index
    if (patternId === "coast16") {
      const idx = r * cols + c;
      const prefix = `tiles_32/${String(idx).padStart(2, "0")}_`;
      const hit = files.find((f) => f.startsWith(prefix) && f.endsWith("_32.png"));
      if (hit) return hit;
    }
    return null;
  }

  // IMPORTANT: row-major ordered tiles from the prompt JSON (sorted by id to be deterministic)
  const orderedTiles = useMemo(() => {
    const arr = tilespecsQ.data?.tiles ? [...tilespecsQ.data.tiles] : [];
    arr.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    return arr;
  }, [tilespecsQ.data?.tiles]);

  // Editor state
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [finalPromptDirty, setFinalPromptDirty] = useState(false);
  const [materialsTxt, setMaterialsTxt] = useState(tilesetMaterials);
  const [paletteTxt, setPaletteTxt] = useState(tilesetPaletteText);
  const [interfaceTxt, setInterfaceTxt] = useState(tilesetInterface);
  useEffect(() => { setMaterialsTxt(tilesetMaterials); }, [tilesetMaterials]);
  useEffect(() => { setPaletteTxt(tilesetPaletteText); }, [tilesetPaletteText]);
  useEffect(() => { setInterfaceTxt(tilesetInterface); }, [tilesetInterface]);
  // A/B materials + vehicles (vehicles selection moved to export card)
  const [materialAName, setMaterialAName] = useState<string>(materialsAB?.A?.name ?? "Land");
  const [materialBName, setMaterialBName] = useState<string>(materialsAB?.B?.name ?? "Water");
  useEffect(() => { setMaterialAName(materialsAB?.A?.name ?? "Land"); }, [materialsAB?.A?.name]);
  useEffect(() => { setMaterialBName(materialsAB?.B?.name ?? "Water"); }, [materialsAB?.B?.name]);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 32, h: 32 });
  // Track which tiles are currently generating (keyed by rXX_cYY)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [genError, setGenError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportDebug, setExportDebug] = useState(false);
  const [exportResult, setExportResult] = useState<null | { localDir: string; projectDir?: string | null; atlas: string; tres: string; rulesSource: string }>(null);
  const [vehiclesA, setVehiclesA] = useState<string[]>(materialsAB?.A?.vehicles ?? []);
  const [vehiclesB, setVehiclesB] = useState<string[]>(materialsAB?.B?.vehicles ?? []);
  useEffect(() => { setVehiclesA(materialsAB?.A?.vehicles ?? []); }, [materialsAB?.A?.vehicles]);
  useEffect(() => { setVehiclesB(materialsAB?.B?.vehicles ?? []); }, [materialsAB?.B?.vehicles]);
  const [debugLog, setDebugLog] = useState<string>("");
  const [debugRefreshing, setDebugRefreshing] = useState(false);
  async function refreshDebugLog() {
    try {
      setDebugRefreshing(true);
      const url = tilesetFileUrl(slug, "debug.log", Date.now());
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        setDebugLog("(no debug.log yet)");
        return;
      }
      const txt = await r.text();
      setDebugLog(txt);
    } catch (e: any) {
      setDebugLog(`(error loading debug.log) ${String(e?.message ?? e)}`);
    } finally {
      setDebugRefreshing(false);
    }
  }
  useEffect(() => { if (slug) refreshDebugLog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);
  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSlot, setUploadSlot] = useState<"A"|"B"|"transition">("A");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  // Procedural settings
  const [procBand, setProcBand] = useState<number>(4);
  const [procCorner, setProcCorner] = useState<"stepped"|"quarter"|"square">("stepped");
  const [procScale, setProcScale] = useState<number>(1);
  const [procPending, setProcPending] = useState<boolean>(false);
  const [procStatus, setProcStatus] = useState<string>("");
  const [procLineStyle, setProcLineStyle] = useState<"straight_line"|"wavy_smooth"|"craggy"|"zigzag">("straight_line");

  // Procedural Textures panel helpers
  function textureRel(slot: "A"|"B"|"transition"): string {
    const name = slot === "A" ? "materialA.png" : slot === "B" ? "materialB.png" : "transition.png";
    return `procedural/${name}`;
  }
  function textureUrl(slot: "A"|"B"|"transition"): string | null {
    const rel = textureRel(slot);
    const present = files.includes(rel);
    return present ? tilesetFileUrl(slug, rel, imgBust) : null;
  }

  // Map (r,c) → tile name by row-major index into orderedTiles; any overflow is blank
  function tileNameAt(r: number, c: number): string | "" {
    const idx = r * cols + c;
    const t = orderedTiles[idx];
    return t?.name ?? "";
  }
  function instructionFor(name: string): string {
    if (!name) return "";
    const t = tilespecsQ.data?.tiles?.find((x) => x.name === name);
    return t?.prompt ?? "";
  }

  function composePromptV2Preview(slotText: string) {
    const pd = (projectQ.data as any)?.settings?.promptDefaults ?? {};
    const parts = [] as string[];
    const push = (label: string, value?: string) => {
      const v = oneline(value || "");
      if (v) parts.push(`[${label}] ${v}`);
    };
    push("STYLE", pd.style);
    push("TILEABILITY", pd.tileability);
    push("UNITS", pd.units);
    const abLine = (materialAName || materialBName) ? `A=${oneline(materialAName || "Land")}; B=${oneline(materialBName || "Water")}.` : "";
    // Traversal preview moved to export card; keep empty here
    const travLine = "";
    push("MATERIALS", [abLine, oneline(materialsTxt)].filter(Boolean).join(" "));
    push("TRAVERSAL", travLine);
    push("PALETTE", paletteTxt);
    push("ALPHA", pd.alpha);
    push("INTERFACE", interfaceTxt);
    push("SLOT", slotText);
    push("OUTPUT", pd.output);
    push(
      "CONSTRAINTS",
      "Fill the entire canvas; no blank or transparent pixels. Every output pixel must be from the [PALETTE]; no off-palette colors, no anti-aliasing, no gradients, no halos."
    );
    if (userPrompt && userPrompt.trim()) parts.push(userPrompt.trim());
    const result = parts.join("\n\n");
    // Debug: visibility and inclusion checks
    const has = (tag: string) => result.includes(`[${tag}]`);
    console.debug("[tileset] preview_pd_availability", {
      have: {
        style: !!pd?.style,
        tileability: !!pd?.tileability,
        units: !!pd?.units,
        alpha: !!pd?.alpha,
        output: !!pd?.output,
      },
      includes: {
        STYLE: has("STYLE"),
        TILEABILITY: has("TILEABILITY"),
        UNITS: has("UNITS"),
        ALPHA: has("ALPHA"),
        OUTPUT: has("OUTPUT"),
      },
    });
    return result;
  }

  // Recompose prompt when tileset sections or project defaults or user hint change (if not dirty)
  const slotInstr = selected ? instructionFor(tileNameAt(selected.r, selected.c)) : "";
  useEffect(() => {
    if (!selected) return;
    if (!finalPromptDirty) setFinalPrompt(composePromptV2Preview(slotInstr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialsTxt, paletteTxt, interfaceTxt, projectQ.data, userPrompt]);

  // Always reset prompt when the selected tile changes
  useEffect(() => {
    if (!selected) {
      setFinalPrompt("");
      setFinalPromptDirty(false);
    } else {
      setFinalPrompt(composePromptV2Preview(slotInstr));
      setFinalPromptDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.r, selected?.c]);

  // Mutations
  // Auto-set pattern if files clearly indicate coast16 and meta says otherwise
  const didAutoSetPattern = useRef(false);
  useEffect(() => {
    if (didAutoSetPattern.current) return;
    const hasCoast = files.some((f) => /coast16_(\d+)?\.png$/i.test(f) || /coast16_manifest\.json$/i.test(f));
    if (hasCoast && metaQ.data?.pattern !== "coast16") {
      didAutoSetPattern.current = true;
      (async () => {
        try {
          await updateTilesetMeta(slug, { pattern: "coast16" });
          qc.invalidateQueries({ queryKey: ["tilesetMeta", slug] });
        } catch (e) {
          console.warn("[tileset] auto_set_pattern_failed", e);
        }
      })();
    }
  }, [files, metaQ.data?.pattern, slug]);

  const bustAssets = () => {
    console.debug("[tileset] bustAssets", { slug });
    qc.invalidateQueries({ queryKey: ["tilesetAssets", slug] });
    setImgBust(Date.now());
  };

  const mGenerate = useMutation({
    mutationFn: async ({ r, c }: { r: number; c: number }) => {
      const key = tileKey(r, c);
      const name = tileNameAt(r, c) || undefined;
      const payload = { slug, pattern: patternId, key, prompt: userPrompt.trim(), tileName: name, fullPrompt: finalPrompt } as const;
      const has = (tag: string) => finalPrompt.includes(`[${tag}]`);
      console.debug("[tileset] generate_click", {
        slug,
        r,
        c,
        key,
        tileName: name,
        promptLen: payload.prompt.length,
        usingFullPrompt: !!finalPrompt,
        includes: { STYLE: has("STYLE"), TILEABILITY: has("TILEABILITY"), UNITS: has("UNITS"), ALPHA: has("ALPHA"), OUTPUT: has("OUTPUT") },
        fullPromptPreview: finalPrompt.slice(0, 200),
      });
      return generateTile(payload as any);
    },
    onMutate: ({ r, c }) => {
      const key = tileKey(r, c);
      setGenError(null);
      setPendingKeys((prev) => new Set(prev).add(key));
    },
    onSuccess: (j, vars) => {
      console.debug("[tileset] generate_success", { r: vars.r, c: vars.c, url: j?.url, sheetUrl: j?.sheetUrl });
      if (j?.url) {
        const rel = j.url.replace(`/tilesets/${encodeURIComponent(slug)}/files/`, "");
        setLatestUrl(tilesetFileUrl(slug, rel, Date.now()));
      }
      bustAssets(); // server auto-stitches; this refreshes the sheet/files list
    },
    onError: (err: any, vars) => {
      const msg = String(err?.message ?? err);
      setGenError(msg);
      console.error("[tileset] generate_error", { r: vars?.r, c: vars?.c, err: msg });
    },
    onSettled: (_data, _err, vars) => {
      // Clear pending flag for this key
      const key = tileKey(vars.r, vars.c);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
  });

  const mDelete = useMutation({
    mutationFn: async () => {
      if (!slug) throw new Error("missing slug");
      const ok = window.confirm(`Delete tileset \"${slug}\"? This removes its folder under assets/tilesets.`);
      if (!ok) return Promise.reject(new Error("cancelled"));
      const { deleteTileset } = await import("@/lib/api");
      return deleteTileset(slug);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tilesets"] });
      nav("/tilesets");
    },
  });

  const mStitch = useMutation({
    mutationFn: async () => stitchTileset({ slug, pattern: patternId }),
    onSuccess: bustAssets,
  });

  const mCrop = useMutation({
    mutationFn: async ({ r, c }: { r: number; c: number }) =>
      cropTile({ slug, pattern: patternId, key: tileKey(r, c), ...crop }),
    onSuccess: (j) => {
      if (j?.url) {
        const rel = j.url.replace(`/tilesets/${encodeURIComponent(slug)}/files/`, "");
        setLatestUrl(tilesetFileUrl(slug, rel, Date.now()));
      }
      bustAssets();
    },
  });

  const mUpdateMeta = useMutation({
    mutationFn: async () => updateTilesetMeta(slug, {
      materials_text: materialsTxt,
      palette_text: paletteTxt,
      interface_text: interfaceTxt,
      materials_ab: { A: { name: materialAName || "Land" }, B: { name: materialBName || "Water" } },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tilesetMeta", slug] });
      console.debug("[tileset] meta_updated");
    },
  });

  function hasTile(r: number, c: number) {
    return tilePreviewRel(r, c) !== null;
  }

  function neighborCells(center: { r: number; c: number }) {
    const out: { r: number; c: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.push({ r: center.r + dr, c: center.c + dc });
    return out;
  }

  return (
    <div className="space-y-6">
      <BackHeader
        title={`Edit Tileset: ${slug}`}
        right={
          <Button onClick={() => mDelete.mutate()} disabled={mDelete.isPending} className="border bg-white hover:bg-slate-50 text-red-600">
            {mDelete.isPending ? "Deleting…" : "Delete Tileset"}
          </Button>
        }
      />

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Pattern: <span className="font-medium">{patternInfo.displayName}</span>{" "}
          <span className="text-slate-500">({cols}×{rows}, {patternInfo.slots} slots)</span>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              console.debug("[tileset] generate_all_click", { rows, cols });
              (async () => {
                for (let r = 0; r < rows; r++) {
                  for (let c = 0; c < cols; c++) {
                    const name = tileNameAt(r, c) || undefined;
                    if (!name) continue; // skip cells without a defined slot
                    const key = tileKey(r, c);
                    const perSlot = instructionFor(name || "");
                    const fp = composePromptV2Preview(perSlot);
                    setPendingKeys((prev) => new Set(prev).add(key));
                    try {
                      const j = await generateTile({ slug, pattern: patternId, key, prompt: userPrompt.trim(), tileName: name, fullPrompt: fp } as any);
                      console.debug("[tileset] all_cell_done", { r, c, url: j?.url });
                      if (j?.url) {
                        const rel = j.url.replace(`/tilesets/${encodeURIComponent(slug)}/files/`, "");
                        setLatestUrl(tilesetFileUrl(slug, rel, Date.now()));
                      }
                    } catch (err: any) {
                      console.error("[tileset] all_cell_error", { r, c, err: String(err?.message ?? err) });
                    } finally {
                      setPendingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
                      bustAssets();
                    }
                  }
                }
              })();
            }}
            disabled={mGenerate.isPending}
            className="border bg-white text-slate-700 hover:bg-slate-50"
            title={`Generate all tiles in the ${patternInfo.displayName} grid`}
          >
            Generate Tileset
          </Button>
          <Button onClick={() => mStitch.mutate()} disabled={mStitch.isPending} className="border bg-white text-slate-700 hover:bg-slate-50">
            {mStitch.isPending ? "Stitching…" : "Stitch Sheet"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grid */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-3">
            <div className="text-sm text-slate-600">Grid</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tileSizePx}px)`, gap: 6 }}>
              {Array.from({ length: rows }).map((_, r) =>
                Array.from({ length: cols }).map((__, c) => {
                  const rel = tilePreviewRel(r, c);
                  const present = !!rel;
                  const img = rel ? tilesetFileUrl(slug, rel, imgBust) : null;
                  const keyStr = tileKey(r, c);
                  const isSel = selected?.r === r && selected?.c === c;
                  const name = tileNameAt(r, c);
                  const isPending = pendingKeys.has(keyStr);
                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => setSelected({ r, c })}
                      className={`relative rounded border transition-shadow ${
                        present ? "bg-checker" : "bg-white"
                      } ${isSel ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white" : ""}`}
                      style={{ width: tileSizePx, height: tileSizePx }}
                      title={`${keyStr}${name ? ` • ${name}` : ""}`}
                    >
                      {img ? (
                        <>
                          <img src={img} className="absolute inset-0 w-full h-full object-contain image-render-pixel rounded" alt="" />
                          {isPending ? (
                            <div className="absolute inset-0 rounded bg-white/60 flex items-center justify-center">
                              <span className="text-[11px] text-slate-700 animate-pulse">Generating…</span>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {!isPending ? (
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600 px-1 text-center break-words break-all whitespace-normal">
                              {name || keyStr}
                            </span>
                          ) : null}
                          {isPending ? (
                            <div className="absolute inset-0 rounded bg-white/60 flex items-center justify-center">
                              <span className="text-[11px] text-slate-700 animate-pulse">Generating…</span>
                            </div>
                          ) : null}
                        </>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
        {/* Tileset-level editor (separate component) */}
        <TilesetSectionsEditor
          materials={materialsTxt}
          palette={paletteTxt}
          iface={interfaceTxt}
          materialAName={materialAName}
          materialBName={materialBName}
          setMaterials={setMaterialsTxt}
          setPalette={setPaletteTxt}
          setIface={setInterfaceTxt}
          setMaterialAName={setMaterialAName}
          setMaterialBName={setMaterialBName}
          saving={mUpdateMeta.isPending}
          onSave={() => mUpdateMeta.mutate()}
        />
      </div>

      {/* Bottom tile-level controls (full width) */}
      <TileControls
        selected={selected}
        slotName={selected ? tileNameAt(selected.r, selected.c) : ""}
        fullPrompt={finalPrompt}
        onEditFinalPrompt={(t) => { setFinalPromptDirty(true); setFinalPrompt(t); }}
        userPrompt={userPrompt}
        setUserPrompt={setUserPrompt}
        onGenerate={() => selected && mGenerate.mutate(selected)}
        genPending={mGenerate.isPending}
        onOpenModal={() => setModalOpen(true)}
        latestUrl={latestUrl}
        crop={crop}
        setCrop={setCrop}
        onCrop={() => selected && mCrop.mutate(selected)}
        cropPending={mCrop.isPending}
        genError={genError}
        filePath={selected ? tilePreviewRel(selected.r, selected.c) : null}
      />

      {/* Procedural Textures */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="font-medium">Procedural Textures (A, B, Transition)</div>
          {(["A","B","transition"] as const).map((slot) => {
            const label = slot === "A" ? "Texture A" : slot === "B" ? "Texture B" : "Transition";
            const current = textureUrl(slot);
            return (
              <div key={slot} className="flex items-start gap-4">
                <div className="w-20 h-20 bg-checker border rounded overflow-hidden flex items-center justify-center">
                  {current ? (
                    <img src={current} className="w-full h-full object-contain image-render-pixel" alt="" />
                  ) : (
                    <span className="text-[11px] text-slate-500">none</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium mb-2">{label}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={async () => {
                      try {
                        await generateTilesetTexture(slug, slot);
                        qc.invalidateQueries({ queryKey: ["tilesetAssets", slug] });
                        setImgBust(Date.now());
                      } catch (e: any) {
                        alert(String(e?.message ?? e));
                      }
                    }}>Generate</Button>
                    <Button className="border bg-white hover:bg-slate-50" onClick={() => { setUploadSlot(slot); setUploadFile(null); setUploadOpen(true); }}>Upload</Button>
                    <Button className="border bg-white hover:bg-slate-50" onClick={async () => {
                      try {
                        await deleteTilesetTexture(slug, slot);
                        qc.invalidateQueries({ queryKey: ["tilesetAssets", slug] });
                        setImgBust(Date.now());
                      } catch (e: any) {
                        alert(String(e?.message ?? e));
                      }
                    }}>Remove</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Procedural Coast16 Settings */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="font-medium">Procedural Coast16</div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[11px] text-slate-600 mb-1">Band width (px)</div>
              <Input type="number" value={procBand} onChange={(e) => setProcBand(Math.max(1, Number(e.target.value) || 4))} />
            </div>
            <div>
              <div className="text-[11px] text-slate-600 mb-1">Corner style</div>
              <select className="border rounded px-2 py-2 w-full" value={procCorner} onChange={(e) => setProcCorner(e.target.value as any)}>
                <option value="stepped">stepped</option>
                <option value="quarter">quarter</option>
                <option value="square">square</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] text-slate-600 mb-1">Line style</div>
              <select className="border rounded px-2 py-2 w-full" value={procLineStyle} onChange={(e) => setProcLineStyle(e.target.value as any)}>
                <option value="straight_line">straight_line</option>
                <option value="wavy_smooth">wavy_smooth</option>
                <option value="craggy">craggy</option>
                <option value="zigzag">zigzag</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] text-slate-600 mb-1">Texture scale</div>
              <Input type="number" step="0.1" value={procScale} onChange={(e) => setProcScale(Math.max(0.1, Number(e.target.value) || 1))} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={async () => {
              try {
                setProcPending(true);
                setProcStatus("Queued…");
                const { generateProceduralTileset, getJob } = await import("@/lib/api");
                const r = await generateProceduralTileset(slug, { bandWidth: procBand, cornerStyle: procCorner, textureScale: procScale, transitionMode: "texture", tileSize: 32, lineStyle: procLineStyle });
                const jobId = r.jobId;
                // simple poll
                let finished = false;
                for (let i=0;i<120;i++) {
                  const j = await getJob(jobId);
                  if (j.state === "not_found") { finished = true; break; }
                  setProcStatus(`State: ${j.state}`);
                  if (j.state === "completed") { finished = true; break; }
                  if (j.state === "failed") {
                    setProcStatus(`Failed: ${(j as any).failedReason || "unknown"}`);
                    refreshDebugLog();
                    return;
                  }
                  await new Promise(r => setTimeout(r, 1000));
                }
                if (!finished) {
                  setProcStatus("Timeout waiting for completion");
                } else {
                  setProcStatus("Completed");
                }
                qc.invalidateQueries({ queryKey: ["tilesetAssets", slug] });
                setImgBust(Date.now());
                refreshDebugLog();
              } catch (e: any) {
                setProcStatus(`Error: ${String(e?.message ?? e)}`);
              } finally {
                setProcPending(false);
              }
            }} disabled={procPending}>
              {procPending ? "Generating…" : "Generate Procedural Tiles"}
            </Button>
            {procStatus ? <span className="text-xs text-slate-600">{procStatus}</span> : null}
          </div>
        </CardContent>
      </Card>

      {/* Godot export */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Godot TileSet Export</div>
            <div className="flex items-center gap-3">
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={exportDebug} onChange={(e) => setExportDebug(e.target.checked)} />
                Debug logs
              </label>
            </div>
          </div>

          {/* Vehicles selection per material (multi-choice) */}
          <div className="grid grid-cols-2 gap-3">
            {(() => {
              const options = ["boat","walk","atv","fly"] as const;
              function CheckboxGroup({ label, selected, onChange }: { label: string; selected: string[]; onChange: (next: string[]) => void }) {
                return (
                  <div className="space-y-1">
                    <div className="text-xs text-slate-600">{label}</div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {options.map((opt) => {
                        const checked = selected.includes(opt);
                        return (
                          <label key={opt} className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(opt);
                                else next.delete(opt);
                                onChange(Array.from(next));
                              }}
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const [aSel, bSel] = [vehiclesA, vehiclesB];

              return (
                <>
                  <CheckboxGroup
                    label={`Vehicles (Material A)`}
                    selected={aSel}
                    onChange={(next) => setVehiclesA(next)}
                  />
                  <CheckboxGroup
                    label={`Vehicles (Material B)`}
                    selected={bSel}
                    onChange={(next) => setVehiclesB(next)}
                  />
                </>
              );
            })()}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={async () => {
                try {
                  setExporting(true);
                  setExportResult(null);
                  // Persist vehicles to meta before export
                  await updateTilesetMeta(slug, { materials_ab: { A: { name: materialAName || "Land", vehicles: vehiclesA }, B: { name: materialBName || "Water", vehicles: vehiclesB } } });
                  const r = await exportTilesetGodot(slug, { debug: exportDebug });
                  setExportResult(r as any);
                } catch (e: any) {
                  alert(String(e?.message ?? e));
                } finally {
                  setExporting(false);
                }
              }}
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "Export TileSet"}
            </Button>
            <Button
              className="border bg-white hover:bg-slate-50"
              onClick={async () => {
                try {
                  await updateTilesetMeta(slug, { materials_ab: { A: { name: materialAName || "Land", vehicles: vehiclesA }, B: { name: materialBName || "Water", vehicles: vehiclesB } } });
                  qc.invalidateQueries({ queryKey: ["tilesetMeta", slug] });
                  alert("Traversal options saved.");
                } catch (e: any) {
                  alert(String(e?.message ?? e));
                }
              }}
            >
              Save Traversal
            </Button>
          </div>
          {exportResult ? (
            <div className="text-xs text-slate-700 space-y-1">
              <div>Sheet: <code>{exportResult.atlas}</code> • Tres: <code>{exportResult.tres}</code> • Rules: <code>{exportResult.rulesSource}</code></div>
              <div>Local dir: <code>{exportResult.localDir}</code></div>
              {exportResult.projectDir ? (
                <div>Project dir: <code>{exportResult.projectDir}</code></div>
              ) : (
                <div className="text-[11px] text-slate-500">Project mirror not configured.</div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Debug log */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Tileset Debug Log</div>
            <div className="flex items-center gap-2">
              <Button onClick={refreshDebugLog} disabled={debugRefreshing} className="border bg-white hover:bg-slate-50">
                {debugRefreshing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>
          <pre className="text-xs bg-slate-50 border rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">{debugLog || "(no debug.log yet)"}</pre>
        </CardContent>
      </Card>

      {/* Upload modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={`Upload ${uploadSlot === 'A' ? 'Material A' : uploadSlot === 'B' ? 'Material B' : 'Transition'}`}>
        <div className="space-y-3">
          <div className="text-sm text-slate-700">Select a PNG/WebP/JPEG file to upload as {uploadSlot === 'A' ? 'material A' : uploadSlot === 'B' ? 'material B' : 'transition'} texture. File is stored under <code>procedural/</code> and referenced in meta.</div>
          <input
            type="file"
            accept="image/png,image/webp,image/jpeg"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!uploadFile) return;
                try {
                  await uploadTilesetTexture(slug, uploadSlot, uploadFile);
                  qc.invalidateQueries({ queryKey: ["tilesetAssets", slug] });
                  qc.invalidateQueries({ queryKey: ["tilesetMeta", slug] });
                  setImgBust(Date.now());
                  setUploadOpen(false);
                } catch (e: any) {
                  alert(String(e?.message ?? e));
                }
              }}
              disabled={!uploadFile}
            >
              Upload
            </Button>
            <Button className="border bg-white hover:bg-slate-50" onClick={() => setUploadOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Modal (neighbors) */}
      <Modal
        open={modalOpen && !!selected}
        onClose={() => setModalOpen(false)}
        title={selected ? `Tile ${tileKey(selected.r, selected.c)} — ${patternInfo.displayName}` : "Tile editor"}
      >
        {!selected ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(() => {
                const center = selected!;
                const cells: { r: number; c: number }[] = [];
                for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cells.push({ r: center.r + dr, c: center.c + dc });
                return cells.map(({ r, c }, i) => {
                  const out = r < 0 || c < 0 || r >= rows || c >= cols;
                  if (out) return <div key={i} className="h-24 bg-slate-100 rounded border" />;
                  const rel = tilePreviewRel(r, c);
                  const img = rel ? tilesetFileUrl(slug, rel, imgBust) : null;
                  const isPending = pendingKeys.has(tileKey(r, c));
                  return (
                    <div key={`${r}-${c}`} className="h-24 bg-checker rounded border relative">
                      {img ? (
                        <img src={img} className="absolute inset-0 w-full h-full object-contain image-render-pixel" alt="" />
                      ) : (
                        !isPending ? (
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600">
                            {tileKey(r, c)}
                          </div>
                        ) : null
                      )}
                      {isPending ? (
                        <div className="absolute inset-0 rounded bg-white/60 flex items-center justify-center">
                          <span className="text-[11px] text-slate-700 animate-pulse">Generating…</span>
                        </div>
                      ) : null}
                    </div>
                  );
                });
              })()}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => selected && mGenerate.mutate(selected)} disabled={mGenerate.isPending}>
                {mGenerate.isPending ? "Generating…" : "Re-generate"}
              </Button>
              <Button onClick={() => selected && mCrop.mutate(selected)} disabled={mCrop.isPending} className="border bg-white hover:bg-slate-50">
                {mCrop.isPending ? "Cropping…" : "Crop current"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
