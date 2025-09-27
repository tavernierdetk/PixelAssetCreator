// apps/web/src/pages/TilesetsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { BackHeader } from "@/components/BackHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  listTilesets,
  listTilesetAssets,
  tilesetFileUrl,
  enqueueTileset,
  getJob,
  getPatterns,
  getTilesetMeta,
} from "@/lib/api";

/** Poll a BullMQ job until completion/failure with a simple loop. */
function useJobPolling() {
  return async function poll(jobId: string, { timeoutMs = 180_000, intervalMs = 1_500 } = {}) {
    const t0 = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const j = await getJob(jobId);
      if (j?.state === "completed") return j;
      if (j?.state === "failed") throw new Error("Tileset generation failed");
      if (Date.now() - t0 > timeoutMs) throw new Error("Tileset generation timed out");
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
}

type PatternInfo = {
  id: string;
  displayName: string;
  tileSize: number;
  grid: { cols: number; rows: number };
  slots: number;
  docs?: string;
};

export default function TilesetsPage() {
  const qc = useQueryClient();
  const poll = useJobPolling();

  /** Available patterns for the dropdown */
  const patternsQ = useQuery({
    queryKey: ["tilesetPatterns"],
    queryFn: getPatterns,
  });

  /** All tileset slugs */
  const listQ = useQuery({
    queryKey: ["tilesets"],
    queryFn: listTilesets,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [bust, setBust] = useState<number>(0); // cache-buster for <img> src

  /* Pick a default selection when list loads */
  useEffect(() => {
    if (!selected && (listQ.data?.slugs?.length ?? 0) > 0) {
      setSelected(listQ.data!.slugs[0]);
    }
  }, [listQ.data, selected]);

  /** Meta for the selected tileset (so we know its pattern) */
  const metaQ = useQuery({
    queryKey: ["tilesetMeta", selected],
    queryFn: () => (selected ? getTilesetMeta(selected) : Promise.resolve(null)),
    enabled: !!selected,
  });

  /** Files for the selected tileset */
  const assetsQ = useQuery({
    queryKey: ["tilesetAssets", selected],
    queryFn: () =>
      selected ? listTilesetAssets(selected) : Promise.resolve({ ok: true, files: [] as string[] }),
    enabled: !!selected,
  });

  /** Enqueue a tileset generation */
  const mEnqueue = useMutation({
    mutationFn: async (payload: {
      slug: string;
      pattern: string;
      material?: string;
      mode?: "direct" | "mask";
      paletteName?: string;
    }) => {
      return enqueueTileset(payload);
    },
    onSuccess: async (res, vars) => {
      const j = await poll(res.jobId);
      await qc.invalidateQueries({ queryKey: ["tilesets"] });
      await qc.invalidateQueries({ queryKey: ["tilesetAssets", vars.slug] });
      await qc.invalidateQueries({ queryKey: ["tilesetMeta", vars.slug] });
      setSelected(vars.slug);
      setBust(Date.now());
    },
  });

  /** Try to pick a nice preview sheet */
  const sheet = useMemo(() => {
    const files = assetsQ.data?.files ?? [];
    const pattern = metaQ.data?.pattern;

    if (pattern) {
      const exact = files.find((f) => f === `${pattern}_32.png`);
      if (exact) return exact;
      const anyPatternSheet = files.find((f) => /_32\.png$/i.test(f));
      if (anyPatternSheet) return anyPatternSheet;
    }

    // Fall back to anything that looks like a sheet
    return files.find((f) => /_32\.png$/i.test(f)) || files.find((f) => /\.png$/i.test(f)) || null;
  }, [assetsQ.data, metaQ.data]);

  const selectedPatternInfo: PatternInfo | undefined = useMemo(() => {
    if (!metaQ.data?.pattern) return undefined;
    return patternsQ.data?.find((p) => p.id === metaQ.data!.pattern);
  }, [patternsQ.data, metaQ.data]);

  return (
    <div className="space-y-6">
      <BackHeader title="Tilesets" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: list of tileset slugs */}
        <Card className="md:col-span-1">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Projects</div>
              <button
                className="text-xs underline"
                onClick={() => qc.invalidateQueries({ queryKey: ["tilesets"] })}
              >
                Refresh
              </button>
            </div>

            {listQ.data?.slugs?.length ? (
              <ul className="divide-y rounded-xl border">
                {listQ.data.slugs.map((slug) => (
                  <li
                    key={slug}
                    className={`px-3 py-2 cursor-pointer ${
                      selected === slug ? "bg-slate-50" : ""
                    }`}
                    onClick={() => setSelected(slug)}
                  >
                    {slug}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No tilesets yet — create one on the right.</p>
            )}
          </CardContent>
        </Card>

        {/* Middle: preview panel */}
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">
                Preview
                {selectedPatternInfo ? (
                  <span className="ml-2 text-xs text-slate-500">
                    ({selectedPatternInfo.displayName})
                  </span>
                ) : null}
              </div>
              {selected && (
                <div className="flex items-center gap-3">
                  <Link
                    className="text-xs underline"
                    to={`/tilesets/${encodeURIComponent(selected)}`}
                  >
                    Edit tileset
                  </Link>
                  <button
                    className="text-xs underline"
                    onClick={() =>
                      qc.invalidateQueries({ queryKey: ["tilesetAssets", selected] })
                    }
                  >
                    Refresh
                  </button>
                </div>
              )}
            </div>

            {!selected ? (
              <p className="text-sm text-slate-600">Select a tileset project.</p>
            ) : !assetsQ.data?.files?.length ? (
              <p className="text-sm text-slate-600">
                No files yet for <code>{selected}</code>.
              </p>
            ) : (
              <div className="space-y-4">
                {sheet && (
                  <div>
                    <div className="text-sm text-slate-600 mb-1">Sheet</div>
                    <img
                      src={tilesetFileUrl(selected, sheet, bust)}
                      alt="tileset sheet"
                      className="w-full max-w-[640px] image-render-pixel border rounded-lg"
                    />
                  </div>
                )}

                <div>
                  <div className="text-sm text-slate-600 mb-1">Files</div>
                  <ul className="text-xs grid grid-cols-2 md:grid-cols-3 gap-2">
                    {(assetsQ.data?.files ?? []).map((f) => (
                      <li key={f} className="truncate">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Creator */}
      <TilesetCreator
        patterns={patternsQ.data ?? []}
        onCreate={(slug) => {
          setSelected(slug);
          qc.invalidateQueries({ queryKey: ["tilesets"] });
          qc.invalidateQueries({ queryKey: ["tilesetAssets", slug] });
          qc.invalidateQueries({ queryKey: ["tilesetMeta", slug] });
        }}
        onQueue={(args) => mEnqueue.mutate(args)}
        enqueuePending={mEnqueue.isPending}
      />
    </div>
  );
}

/** Small slugify */
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function TilesetCreator(props: {
  patterns: PatternInfo[];
  onCreate: (slug: string) => void;
  onQueue: (args: {
    slug: string;
    pattern: string;
    material?: string;
    mode?: "direct" | "mask";
    paletteName?: string;
  }) => void;
  enqueuePending: boolean;
}) {
  const { patterns, onCreate, onQueue, enqueuePending } = props;

  const [name, setName] = useState("");
  const [material, setMaterial] = useState("grass");
  const [mode, setMode] = useState<"direct" | "mask">("direct");
  const [pattern, setPattern] = useState<string>("blob47");

  useEffect(() => {
    if (!name) setName("grass-01");
  }, []);

  useEffect(() => {
    // Default to the first server pattern if present
    if (patterns.length && !pattern) setPattern(patterns[0].id);
  }, [patterns, pattern]);

  const chosen = useMemo(
    () => patterns.find((p) => p.id === pattern),
    [patterns, pattern]
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="font-medium">Create Tileset</div>

        <div className="grid sm:grid-cols-4 gap-3">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., grass-01"
            />
            <div className="text-[10px] text-slate-500">
              Slug: <code>{slugify(name || "") || "(empty)"}</code>
            </div>
          </div>

          {/* Pattern */}
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Pattern</label>
            <select
              className="border rounded px-2 py-2 w-full"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
            >
              {(patterns.length ? patterns : [{ id: "blob47", displayName: "Blob 47", grid: { cols: 8, rows: 6 }, tileSize: 32, slots: 47 }]).map(
                (p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName ?? p.id}
                  </option>
                )
              )}
            </select>
            <div className="text-[10px] text-slate-500">Immutable per tileset</div>
          </div>

          {/* Material */}
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Material</label>
            <select
              className="border rounded px-2 py-2 w-full"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            >
              <option value="grass">Grass</option>
              <option value="dirt">Dirt</option>
              <option value="stone">Stone</option>
              <option value="sand">Sand</option>
              <option value="water">Water</option>
            </select>
          </div>

          {/* Mode */}
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Mode</label>
            <select
              className="border rounded px-2 py-2 w-full"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="direct">Direct (per tile)</option>
              <option value="mask">Mask-first</option>
            </select>
          </div>
        </div>

        {/* Pattern info hint */}
        {chosen && (
          <div className="text-[11px] text-slate-600">
            {chosen.displayName} — {chosen.grid.cols}×{chosen.grid.rows}, {chosen.slots} slots
          </div>
        )}

        <Button
          type="button"
          onClick={() => {
            const slug = slugify(name || "tileset");
            if (!slug) {
              alert("Enter a valid name");
              return;
            }
            onQueue({
              slug,
              pattern: pattern || "blob47",
              material,
              mode,
              paletteName: "roman_steampunk",
            });
            onCreate(slug);
          }}
          disabled={enqueuePending}
        >
          {enqueuePending ? "Queuing…" : "Generate Tileset"}
        </Button>
      </CardContent>
    </Card>
  );
}
