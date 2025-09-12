import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJob, listAssets, fileUrl, enqueueULPC } from "@/lib/api";

function pretty(obj: unknown) {
  try { return JSON.stringify(obj, null, 2); } catch { return ""; }
}

const DEFAULT_BUILD = {
  schema: "ulpc.build/1.0",
  generator: { project: "Universal-LPC-Spritesheet-Character-Generator", version: "local" },
  animations: ["walk"],
  layers: []
};

type Props = {
  slug: string;
  files: string[];
};

export function ULPCPanel({ slug, files }: Props) {
  const qc = useQueryClient();
  const [buildText, setBuildText] = useState(pretty(DEFAULT_BUILD));
  const [pending, setPending] = useState(false);
  const [bust, setBust] = useState(0);

  const basenames = useMemo(() => (files ?? []).map((f) => f.split("/").pop() || f), [files]);
  const sheet = basenames.find((n) => /^ulpc_spritesheet_.*\.(png|webp|jpg|jpeg)$/i.test(n)) || null;

    const runM = useMutation({
    mutationFn: async () => {
        let build: unknown = null;
        try { build = JSON.parse(buildText); } catch { throw new Error("Invalid JSON in ULPC build"); }

        const { jobId } = await enqueueULPC(slug, build);

        // Poll up to 2 minutes
        for (let i = 0; i < 120; i++) {
        let j: any = null;
        try {
            // eslint-disable-next-line no-await-in-loop
            j = await getJob(jobId);
        } catch (e) {
            // If the server removed the job (404), assume it's done and break.
            break;
        }

        if (j?.state === "completed") return j;

        // Only treat 'failed' as terminal if no more retries are possible
        const attemptsMade = j?.attemptsMade ?? 0;
        const attempts = j?.attempts ?? 1;
        if (j?.state === "failed" && attemptsMade >= attempts) {
            return j; // final failure
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1000));
        }

        // Return a shape that signals “unknown / probably done”
        return { state: "unknown" } as any;
    },
    onSuccess: async (j) => {
        await qc.invalidateQueries({ queryKey: ["assets", slug] });
        setBust(Date.now());

        if (j?.state === "failed") {
        console.warn("ULPC job failed:", j);
        alert("ULPC job failed – see server logs for details.");
        }
    }
    });


  async function handleGenerate() {
    setPending(true);
    try {
      await runM.mutateAsync();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="font-medium">ULPC Spritesheet</div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleGenerate} disabled={pending}>
              {pending ? "Generating…" : "Generate ULPC"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* build editor */}
          <div className="rounded-xl border p-3 bg-slate-50 min-h-64 flex flex-col gap-2">
            <div className="text-sm text-slate-600">Build JSON</div>
            <textarea
              className="w-full h-[280px] rounded border p-2 font-mono text-sm"
              value={buildText}
              onChange={(e) => setBuildText(e.target.value)}
              spellCheck={false}
            />
          </div>

          {/* preview */}
          <div className="rounded-xl border p-3 bg-slate-50 min-h-64 flex flex-col gap-3">
            <div className="text-sm text-slate-600">Output</div>
            <div className="flex-1 min-h-64 flex items-center justify-center bg-white rounded-lg border">
              {sheet ? (
                <img
                  className="max-h-[420px] object-contain"
                  src={fileUrl(slug, sheet) + (bust ? `?t=${bust}` : "")}
                  alt="ULPC spritesheet"
                />
              ) : pending ? (
                <div className="text-sm text-slate-500">Generating…</div>
              ) : (
                <div className="text-sm text-slate-500 text-center">No ULPC spritesheet yet.</div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
