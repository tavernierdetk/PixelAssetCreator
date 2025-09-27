// apps/web/src/pages/TilesetEditPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

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

export default function TilesetEditPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [imgBust, setImgBust] = useState(0);

  // Data
  const metaQ = useQuery({ queryKey: ["tilesetMeta", slug], queryFn: () => getTilesetMeta(slug), enabled: !!slug });
  const patternsQ = useQuery({ queryKey: ["tilesetPatterns"], queryFn: getPatterns });
  const assetsQ = useQuery({ queryKey: ["tilesetAssets", slug], queryFn: () => listTilesetAssets(slug), enabled: !!slug });

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

  // IMPORTANT: row-major ordered tiles from the prompt JSON (sorted by id to be deterministic)
  const orderedTiles = useMemo(() => {
    const arr = tilespecsQ.data?.tiles ? [...tilespecsQ.data.tiles] : [];
    arr.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    return arr;
  }, [tilespecsQ.data?.tiles]);

  // Editor state
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 32, h: 32 });
  // Track which tiles are currently generating (keyed by rXX_cYY)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [genError, setGenError] = useState<string | null>(null);

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

  const fullPrompt = selected
    ? buildFullPrompt(userPrompt, {
        preamble: tilespecsQ.data?.preamble ?? "",
        tileInstruction: instructionFor(tileNameAt(selected.r, selected.c)),
        palette: paletteName,
      })
    : "";

  // Mutations
  const bustAssets = () => {
    console.debug("[tileset] bustAssets", { slug });
    qc.invalidateQueries({ queryKey: ["tilesetAssets", slug] });
    setImgBust(Date.now());
  };

  const mGenerate = useMutation({
    mutationFn: async ({ r, c }: { r: number; c: number }) => {
      const key = tileKey(r, c);
      const name = tileNameAt(r, c) || undefined;
      const payload = { slug, pattern: patternId, key, prompt: userPrompt.trim(), tileName: name } as const;
      console.debug("[tileset] generate_click", { slug, r, c, key, tileName: name, promptLen: payload.prompt.length, fullPromptPreview: fullPrompt.slice(0, 160) });
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

  function hasTile(r: number, c: number) {
    return files.includes(tileRelPath(patternId, r, c));
  }

  function neighborCells(center: { r: number; c: number }) {
    const out: { r: number; c: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.push({ r: center.r + dr, c: center.c + dc });
    return out;
  }

  return (
    <div className="space-y-6">
      <BackHeader title={`Edit Tileset: ${slug}`} />

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Pattern: <span className="font-medium">{patternInfo.displayName}</span>{" "}
          <span className="text-slate-500">({cols}×{rows}, {patternInfo.slots} slots)</span>
        </div>
        <Button onClick={() => mStitch.mutate()} disabled={mStitch.isPending} className="border bg-white text-slate-700 hover:bg-slate-50">
          {mStitch.isPending ? "Stitching…" : "Stitch Sheet"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grid */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-3">
            <div className="text-sm text-slate-600">Grid</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tileSizePx}px)`, gap: 6 }}>
              {Array.from({ length: rows }).map((_, r) =>
                Array.from({ length: cols }).map((__, c) => {
                  const present = hasTile(r, c);
                  const rel = tileRelPath(patternId, r, c);
                  const img = present ? tilesetFileUrl(slug, rel, imgBust) : null;
                  const keyStr = tileKey(r, c);
                  const isSel = selected?.r === r && selected?.c === c;
                  const name = tileNameAt(r, c);
                  const isPending = pendingKeys.has(keyStr);
                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => setSelected({ r, c })}
                      className={`relative rounded border transition-shadow ${
                        present ? "bg-white hover:bg-slate-50" : "bg-slate-50 hover:bg-slate-100"
                      } ${isSel ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white" : ""}`}
                      style={{ width: tileSizePx, height: tileSizePx }}
                      title={`${keyStr}${name ? ` • ${name}` : ""}`}
                    >
                      {img ? (
                        <>
                          <img src={img} className="absolute inset-0 w-full h-full object-contain image-render-pixel rounded" alt="" />
                          {name ? (
                            <div className="absolute bottom-0 left-0 right-0 text-[10px] truncate px-1 py-0.5 bg-white/70">
                              {name}
                            </div>
                          ) : null}
                          {isPending ? (
                            <div className="absolute inset-0 rounded bg-white/60 flex items-center justify-center">
                              <span className="text-[11px] text-slate-700 animate-pulse">Generating…</span>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600">
                            {name || keyStr}
                          </span>
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

        {/* Side editor */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="font-medium">Tile Editor</div>

            {!selected ? (
              <p className="text-sm text-slate-600">Click a cell to select it. The prompt will appear here.</p>
            ) : (
              <>
                <div className="text-xs text-slate-600">
                  Selected cell: <code>r{selected.r} c{selected.c}</code> • File: <code>{tileRelPath(patternId, selected.r, selected.c)}</code>
                </div>

                <div className="text-xs">
                  Slot: <span className="font-medium">{tileNameAt(selected.r, selected.c) || "—"}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Prompt (additional, optional)</label>
                  <textarea
                    className="w-full border rounded p-2 text-sm min-h-[96px]"
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="Add small extra guidance (optional)…"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Final prompt</label>
                  <pre className="text-xs whitespace-pre-wrap bg-slate-50 border rounded p-2">
                    {fullPrompt}
                  </pre>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <Button onClick={() => selected && mGenerate.mutate(selected)} disabled={mGenerate.isPending}>
                    {mGenerate.isPending ? "Generating…" : "Generate"}
                  </Button>
                  <Button onClick={() => setModalOpen(true)} className="border bg-white hover:bg-slate-50">
                    Open Modal
                  </Button>
                  {genError ? (
                    <span className="text-xs text-red-600">{genError}</span>
                  ) : null}
                </div>

                {latestUrl && (
                  <div>
                    <div className="text-xs text-slate-600 mb-1">Latest result</div>
                    <img src={latestUrl} className="w-32 h-32 image-render-pixel border rounded" alt="" />
                  </div>
                )}

                {/* Crop controls */}
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><div className="text-[11px] text-slate-600 mb-1">x</div><Input type="number" value={crop.x} onChange={(e) => setCrop({ ...crop, x: +e.target.value })} /></div>
                  <div><div className="text-[11px] text-slate-600 mb-1">y</div><Input type="number" value={crop.y} onChange={(e) => setCrop({ ...crop, y: +e.target.value })} /></div>
                  <div><div className="text-[11px] text-slate-600 mb-1">w</div><Input type="number" value={crop.w} onChange={(e) => setCrop({ ...crop, w: +e.target.value })} /></div>
                  <div><div className="text-[11px] text-slate-600 mb-1">h</div><Input type="number" value={crop.h} onChange={(e) => setCrop({ ...crop, h: +e.target.value })} /></div>
                  <div className="col-span-4">
                    <Button onClick={() => selected && mCrop.mutate(selected)} disabled={mCrop.isPending || !selected} className="border bg-white hover:bg-slate-50">
                      {mCrop.isPending ? "Cropping…" : "Crop & Save"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
                  const rel = tileRelPath(patternId, r, c);
                  const present = files.includes(rel);
                  const img = present ? tilesetFileUrl(slug, rel, imgBust) : null;
                  const isPending = pendingKeys.has(tileKey(r, c));
                  return (
                    <div key={`${r}-${c}`} className="h-24 bg-white rounded border relative">
                      {img ? (
                        <img src={img} className="absolute inset-0 w-full h-full object-contain image-render-pixel" alt="" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600">
                          {tileKey(r, c)}
                        </div>
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
