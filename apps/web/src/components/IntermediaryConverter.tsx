// apps/web/src/components/IntermediaryConverter.tsx
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { convertIntermediary } from "@/lib/api";

type Props = {
  slug: string;
  intermediary: any | null;
  onComposed?: () => void | Promise<void>;
  onBuild?: (build: any) => void; // ← NEW
};

const IntermediaryConverter: React.FC<Props> = ({ slug, intermediary, onComposed, onBuild }) => {
  const [pending, setPending] = useState(false);
  const [animations, setAnimations] = useState<string>("idle");
  const [build, setBuild] = useState<any | null>(null);
  const [warnings, setWarnings] = useState<any[] | null>(null);

  const hasIntermediary = useMemo(() => Boolean(intermediary), [intermediary]);

  async function handleCompose() {
    if (!intermediary) return;
    setPending(true);
    try {
      const anims = animations.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await convertIntermediary({
        slug,
        intermediary,
        animations: anims.length ? anims : ["idle"],
        compose: true,
      });

      if (res?.ok) {
        setBuild(res.build ?? null);
        setWarnings(res.warnings ?? null);
        if (res.build && onBuild) onBuild(res.build); // ← feed the editor
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
        <p className="text-sm text-slate-600">No intermediary loaded yet. Use the assistant panel above to generate it.</p>
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

          {/* Keep the debug sections if you like */}
          {warnings && warnings.length ? (
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">Warnings</summary>
              <pre className="mt-2 text-xs bg-yellow-50 p-3 rounded-xl overflow-auto">
                {JSON.stringify(warnings, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default IntermediaryConverter;
