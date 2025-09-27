import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJob, fileUrl, enqueueULPC } from "@/lib/api";
import { ULPCControls, ULPCLayers, AnimationDiagnosticMatrix } from "@/components/ULPCBuildEditor";
import type { UlpcSheetCatalog, ComposeWarning } from "@/lib/api";

type Props = {
  slug: string;
  files: string[];
  buildDraft: any;                 // controlled
  onChangeBuild: (next: any) => void;
  sheetCatalog?: UlpcSheetCatalog | null;
  warnings?: ComposeWarning[];
  onWarnings?: (warnings: ComposeWarning[]) => void;
};

const ensureArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((anim): anim is string => typeof anim === "string" && anim.trim().length > 0) : [];

function prepareBuildForWalkSheet(build: any): any {
  const cloned = JSON.parse(JSON.stringify(build ?? {}));
  const animations = ensureArray(cloned.animations);
  if (!animations.includes("walk")) animations.push("walk");
  cloned.animations = animations;

  const output = typeof cloned.output === "object" && cloned.output ? { ...cloned.output } : {};
  const allowed = new Set(["split_by_animation", "both"]);
  if (!allowed.has(output.mode)) {
    output.mode = "both";
  }
  cloned.output = output;
  return cloned;
}

export function ULPCPanel({ slug, files, buildDraft, onChangeBuild, sheetCatalog, warnings, onWarnings }: Props) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<boolean>(false);
  const [bust, setBust] = useState<number>(0);
  const [previewMetrics, setPreviewMetrics] = useState<{ width: number; height: number } | null>(null);

  const normalizedFiles = useMemo(
    () => (files ?? []).map((raw) => ({ raw, normalized: raw.replace(/\\/g, "/").toLowerCase() })),
    [files]
  );

  const basenames = useMemo(() => (files ?? []).map((f) => f.split("/").pop() || f), [files]);
  const sheet = basenames.find((n) => /^ulpc_spritesheet_.*\.(png|webp|jpe?g)$/i.test(n)) || null;

  const buildAnimations = useMemo(() => {
    const arr = Array.isArray((buildDraft as any)?.animations) ? ((buildDraft as any).animations as string[]) : [];
    return arr.filter((anim) => typeof anim === "string" && anim.trim().length > 0);
  }, [buildDraft]);

  const animationSheetMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const { raw, normalized } of normalizedFiles) {
      const match = normalized.match(/ulpc\/([^/]+)\/sheet\.(png|webp|jpe?g)$/);
      if (match) {
        const anim = match[1];
        if (!map.has(anim)) map.set(anim, raw);
      }
    }
    return map;
  }, [normalizedFiles]);

  const buildAnimationsLower = useMemo(
    () => buildAnimations.map((anim) => anim.toLowerCase()),
    [buildAnimations]
  );

  const primaryAnimationLower = useMemo(() => {
    for (const anim of buildAnimationsLower) {
      if (animationSheetMap.has(anim)) return anim;
    }
    if (animationSheetMap.has("walk")) return "walk";
    return buildAnimationsLower[0] ?? (animationSheetMap.size ? Array.from(animationSheetMap.keys())[0] : null);
  }, [buildAnimationsLower, animationSheetMap]);

  const primaryAnimation = useMemo(() => {
    if (!primaryAnimationLower) return null;
    const original = buildAnimations.find((anim) => anim.toLowerCase() === primaryAnimationLower);
    return original ?? primaryAnimationLower;
  }, [buildAnimations, primaryAnimationLower]);

  const animationSheetPath = primaryAnimationLower ? animationSheetMap.get(primaryAnimationLower) ?? null : null;

  const animationFramePath = useMemo(() => {
    if (!primaryAnimationLower) return null;
    const matches = normalizedFiles
      .filter(({ normalized }) => {
        if (!normalized.includes("ulpc_frames/")) return false;
        const [, rest] = normalized.split("ulpc_frames/");
        if (!rest) return false;
        const [firstSeg] = rest.split("/");
        if (!firstSeg) return false;
        const base = firstSeg.split(/[_-]/)[0];
        return base === primaryAnimationLower;
      })
      .sort((a, b) => a.normalized.localeCompare(b.normalized));
    return matches[0]?.raw ?? null;
  }, [normalizedFiles, primaryAnimationLower]);

  const walkPreviewFramePath = useMemo(() => {
    const candidates = normalizedFiles
      .filter(({ normalized }) => normalized.includes("ulpc_frames/walk_right/"))
      .sort((a, b) => a.normalized.localeCompare(b.normalized));
    return candidates[0]?.raw ?? null;
  }, [normalizedFiles]);

  const previewAssetPath = walkPreviewFramePath ?? animationSheetPath ?? (sheet ?? null) ?? animationFramePath ?? null;
  const previewSrc = previewAssetPath ? fileUrl(slug, previewAssetPath, bust) : null;

  const walkSheetPath = useMemo(() => animationSheetMap.get("walk") ?? null, [animationSheetMap]);
  const walkSheetSrc = walkSheetPath ? fileUrl(slug, walkSheetPath, bust) : null;

  useEffect(() => {
    setPreviewMetrics(null);
  }, [previewAssetPath]);

  const frameSizeOverride = (buildDraft as any)?.output?.frame_size;
  const DEFAULT_FRAME_SIZE = 64;
  const frameWidth = typeof frameSizeOverride?.w === "number" && frameSizeOverride.w > 0 ? frameSizeOverride.w : DEFAULT_FRAME_SIZE;
  const frameHeight = typeof frameSizeOverride?.h === "number" && frameSizeOverride.h > 0 ? frameSizeOverride.h : DEFAULT_FRAME_SIZE;
  const previewFrameRow = 2; // third row (0-indexed)
  const previewFrameColumn = 0; // first column (0-indexed)
  const translateX = previewFrameColumn * frameWidth;
  const translateY = previewFrameRow * frameHeight;
  const previewScale = 2.5;
  const cropEligible = Boolean(
    previewAssetPath && walkPreviewFramePath == null && (previewAssetPath === animationSheetPath || previewAssetPath === sheet)
  );
  const metricsAllow = !previewMetrics ||
    (previewMetrics.width >= (previewFrameColumn + 1) * frameWidth && previewMetrics.height >= (previewFrameRow + 1) * frameHeight);
  const shouldCrop = Boolean(previewSrc && cropEligible && frameWidth > 0 && frameHeight > 0 && metricsAllow);

  const handlePreviewLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    setPreviewMetrics({ width: img.naturalWidth ?? 0, height: img.naturalHeight ?? 0 });
  };

  const runM = useMutation({
    mutationFn: async () => {
      const payload = prepareBuildForWalkSheet(buildDraft);
      const { jobId } = await enqueueULPC(slug, payload);
      for (let i = 0; i < 120; i++) {
        // eslint-disable-next-line no-await-in-loop
        const j = await getJob(jobId).catch(() => null);
        if (!j) break;
        if (j.state === "completed") return j;
        if (j.state === "failed") return j;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1000));
      }
      return { state: "unknown" } as any;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["assets", slug] });
      setBust(Date.now());
    },
  });

  async function handleGenerate() {
    setPending(true);
    try {
      const job = await runM.mutateAsync();
      const jobWarnings = (job?.returnvalue as any)?.warnings as ComposeWarning[] | undefined;
      if (Array.isArray(jobWarnings)) onWarnings?.(jobWarnings);
      else onWarnings?.([]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="font-medium">ULPC Spritesheet / Export</div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleGenerate} disabled={pending}>
              {pending ? "Generating…" : "Generate ULPC"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {warnings && warnings.length ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Compose completed with {warnings.length} warning{warnings.length === 1 ? "" : "s"}. Affected layers are highlighted below.
          </div>
        ) : null}

        {/* Top grid: controls (left) + preview (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* LEFT: controls (Animations / Output / Body&Head) */}
          <div className="rounded-xl border p-3 bg-slate-50">
            <ULPCControls value={buildDraft} onChange={onChangeBuild} sheetCatalog={sheetCatalog} />
          </div>

          {/* RIGHT: preview */}
          <div className="rounded-xl border p-3 bg-slate-50 flex flex-col gap-3">
            <div className="text-sm text-slate-600">Preview</div>
            <div className="flex-1 min-h-64 flex items-center justify-center bg-white rounded-lg border p-4">
              {previewSrc ? (
                shouldCrop ? (
                  <div
                    className="relative overflow-hidden border border-slate-300 bg-slate-100"
                    style={{ width: frameWidth * previewScale, height: frameHeight * previewScale }}
                  >
                    <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
                      <img
                        src={previewSrc}
                        alt="ULPC preview"
                        onLoad={handlePreviewLoad}
                        style={{
                          display: "block",
                          transform: `translate(-${translateX}px, -${translateY}px)`,
                          imageRendering: "pixelated",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <img
                    className="max-h-[420px] max-w-full object-contain"
                    src={previewSrc}
                    alt="ULPC preview"
                    onLoad={handlePreviewLoad}
                  />
                )
              ) : pending ? (
                <div className="text-sm text-slate-500">Generating…</div>
              ) : (
                <div className="text-sm text-slate-500 text-center">No preview yet.</div>
              )}
            </div>
            {primaryAnimation ? (
              <div className="text-xs text-slate-500">
                {walkPreviewFramePath
                  ? `Showing ${primaryAnimation} • walk row 3, column 1`
                  : shouldCrop
                    ? `Showing ${primaryAnimation} • row 3, column 1`
                    : `Showing ${primaryAnimation} preview`}
              </div>
            ) : null}
            {!shouldCrop && previewSrc && cropEligible ? (
              <div className="text-xs text-amber-600">
                Unable to isolate the requested frame for this asset; falling back to full image.
              </div>
            ) : null}

            <div className="mt-4">
              <div className="text-xs font-medium text-slate-600 mb-2">Walk Animation Sheet</div>
              <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-lg border bg-white p-3">
                {walkSheetSrc ? (
                  <img
                    src={walkSheetSrc}
                    alt="Walk animation sheet"
                    className="max-h-[420px] max-w-full object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <div className="text-xs text-slate-500 text-center">
                    Build the walk animation to see the full sheet preview.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom (full width): layers */}
        <div className="rounded-xl border p-3 bg-slate-50">
          <ULPCLayers value={buildDraft} onChange={onChangeBuild} sheetCatalog={sheetCatalog} warnings={warnings} />
        </div>

        {/* Diagnostics */}
        <div className="rounded-xl border p-3 bg-slate-50">
          <AnimationDiagnosticMatrix build={buildDraft} sheetCatalog={sheetCatalog} warnings={warnings} />
        </div>
      </CardContent>
    </Card>
  );
}

export default ULPCPanel;
