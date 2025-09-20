import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJob, fileUrl, enqueueULPC } from "@/lib/api";
import { ULPCControls, ULPCLayers } from "@/components/ULPCBuildEditor";
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

export function ULPCPanel({ slug, files, buildDraft, onChangeBuild, sheetCatalog, warnings, onWarnings }: Props) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<boolean>(false);
  const [bust, setBust] = useState<number>(0);

  const basenames = useMemo(() => (files ?? []).map((f) => f.split("/").pop() || f), [files]);
  const sheet = basenames.find((n) => /^ulpc_spritesheet_.*\.(png|webp|jpe?g)$/i.test(n)) || null;

  const firstIdleRight = useMemo(() => {
    const candidates = (files ?? [])
      .filter(
        (p) =>
          /ulpc_frames/i.test(p) &&
          /(idle[_-](right|east)|right[_-]idle)/i.test(p) &&
          /\.(png|webp)$/i.test(p)
      )
      .sort();
    return candidates[0] ?? null;
  }, [files]);

  const previewSrc =
    firstIdleRight ? fileUrl(slug, firstIdleRight, bust) : sheet ? fileUrl(slug, sheet, bust) : null;

  const runM = useMutation({
    mutationFn: async () => {
      const { jobId } = await enqueueULPC(slug, buildDraft);
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
            <div className="flex-1 min-h-64 flex items-center justify-center bg-white rounded-lg border overflow-hidden">
              {previewSrc ? (
                <img className="max-h-[420px] max-w-full object-contain" src={previewSrc} alt="ULPC preview" />
              ) : pending ? (
                <div className="text-sm text-slate-500">Generating…</div>
              ) : (
                <div className="text-sm text-slate-500 text-center">No preview yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom (full width): layers */}
        <div className="rounded-xl border p-3 bg-slate-50">
          <ULPCLayers value={buildDraft} onChange={onChangeBuild} sheetCatalog={sheetCatalog} warnings={warnings} />
        </div>
      </CardContent>
    </Card>
  );
}

export default ULPCPanel;
