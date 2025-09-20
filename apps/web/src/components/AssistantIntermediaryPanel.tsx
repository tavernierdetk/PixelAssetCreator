// apps/web/src/components/AssistantIntermediaryPanel.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CharacterDefinitionLite } from "@/types";
import { assistantGenerateIntermediary, convertIntermediary } from "@/lib/api";
import type { ComposeWarning } from "@/lib/api";

export default function AssistantIntermediaryPanel({
  slug,
  draft,
  onIntermediary,
  onBuild,           // ← NEW
  onComposed,        // ← NEW (optional, to refresh assets)
  onWarnings,
}: {
  slug: string;
  draft?: CharacterDefinitionLite;
  onIntermediary: (obj: any) => void;
  onBuild?: (b: any) => void;
  onComposed?: () => void | Promise<void>;
  onWarnings?: (warnings: ComposeWarning[] | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<any | null>(null);

  async function handleGenerate() {
    setPending(true);
    try {
      // 1) Ask assistant for intermediary
      const res = await assistantGenerateIntermediary(slug, draft);
      if (!(res?.ok && res?.data)) {
        setLast(res);
        alert("Assistant did not return an intermediary.");
        onWarnings?.(null);
        return;
      }
      setLast(res.data);
      onIntermediary(res.data);

      // 2) Convert intermediary → ULPC build (+ compose preview)
      const conv = await convertIntermediary({
        slug,
        intermediary: res.data,
        animations: ["idle"], // default; user can add more in editor
        compose: true,        // write preview/ulpc_<ts>.png so UI shows it
      });

      if (conv?.ok && conv?.build) {
        onBuild?.(conv.build);     // ← feed the structured editor
        const warnList = Array.isArray(conv.composeWarnings)
          ? (conv.composeWarnings as ComposeWarning[])
          : Array.isArray(conv.warnings)
            ? (conv.warnings as ComposeWarning[])
            : null;
        onWarnings?.(warnList ?? []);
        await onComposed?.();      // ← refresh asset list so preview appears
      } else {
        console.warn("[assistant→convert] non-ok:", conv);
        alert(conv?.detail || "Intermediary conversion failed.");
        onWarnings?.([]);
      }
    } catch (e) {
      console.error("[assistant → intermediary/convert] error", e);
      alert("Failed to generate/convert intermediary.");
      onWarnings?.([]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="font-medium">Assistant: Character Lite → Intermediary (+ Build)</div>
          <Button type="button" onClick={handleGenerate} disabled={pending || !slug}>
            {pending ? "Asking Assistant…" : "Generate"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">
          Generates an intermediary and immediately converts it to ULPC build JSON.
          The build editor below will auto-populate, and a preview sheet will be composed.
        </p>
        {last ? (
          <pre className="mt-3 text-xs bg-slate-50 p-3 rounded-xl overflow-auto">
            {JSON.stringify(last, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
