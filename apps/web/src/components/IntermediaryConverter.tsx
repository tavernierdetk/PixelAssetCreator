// apps/web/src/components/IntermediaryConverter.tsx
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { convertIntermediary } from "@/lib/api";

type Props = {
  slug: string;
  intermediary: any | null;
  onComposed?: () => void | Promise<void>;
};

const IntermediaryConverter: React.FC<Props> = ({ slug, intermediary, onComposed }) => {
  const [pending, setPending] = useState(false);
  const [animations, setAnimations] = useState<string>("idle"); // comma separated
  const [build, setBuild] = useState<any | null>(null);
  const [warnings, setWarnings] = useState<any[] | null>(null);

  const hasIntermediary = useMemo(() => Boolean(intermediary), [intermediary]);

  async function handleCompose() {
    if (!intermediary) return;
    setPending(true);
    try {
      const anims = animations
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await convertIntermediary({
        slug,
        intermediary,
        animations: anims.length ? anims : ["idle"],
        compose: true, // write composed sheets so ULPC panel updates from files
      });

      if (res?.ok) {
        setBuild(res.build ?? null);
        setWarnings(res.warnings ?? null);
        if (onComposed) await onComposed();
      } else {
        setBuild(null);
        setWarnings(null);
        alert(res?.detail || "Conversion failed.");
      }
    } catch (e: any) {
      console.error("[intermediary → ULPC] error", e);
      alert(e?.message || "Failed to convert intermediary.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {!hasIntermediary ? (
        <p className="text-sm text-slate-600">
          No intermediary loaded yet. Use the assistant panel above to generate it.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-700">Animations (comma-sep)</label>
            <input
              value={animations}
              onChange={(e) => setAnimations(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="idle,walk,run"
            />
            <Button type="button" onClick={handleCompose} disabled={pending}>
              {pending ? "Composing…" : "Compose from Intermediary"}
            </Button>
          </div>

          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">Intermediary (active)</summary>
            <pre className="mt-2 text-xs bg-slate-50 p-3 rounded-xl overflow-auto">
              {JSON.stringify(intermediary, null, 2)}
            </pre>
          </details>

          {warnings && warnings.length ? (
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">Warnings</summary>
              <pre className="mt-2 text-xs bg-yellow-50 p-3 rounded-xl overflow-auto">
                {JSON.stringify(warnings, null, 2)}
              </pre>
            </details>
          ) : null}

          {build ? (
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">Generated Build JSON</summary>
              <pre className="mt-2 text-xs bg-slate-50 p-3 rounded-xl overflow-auto">
                {JSON.stringify(build, null, 2)}
              </pre>
            </details>
          ) : null}

          <p className="text-xs text-slate-500">
            After compose, the ULPC panel below should list new spritesheets automatically.
          </p>
        </div>
      )}
    </div>
  );
};

export default IntermediaryConverter;
