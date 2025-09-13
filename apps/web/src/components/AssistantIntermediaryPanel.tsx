import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CharacterDefinitionLite } from "@/types";
import { assistantGenerateIntermediary } from "@/lib/api";

export default function AssistantIntermediaryPanel({
  slug,
  draft,
  onIntermediary,
}: {
  slug: string;
  draft?: CharacterDefinitionLite;
  onIntermediary: (obj: any) => void;
}) {
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<any | null>(null);

  async function handleGenerate() {
    setPending(true);
    try {
      const res = await assistantGenerateIntermediary(slug, draft);
      if (res?.ok && res?.data) {
        setLast(res.data);
        onIntermediary(res.data);
      } else {
        setLast(res);
        alert("Assistant did not return an intermediary.");
      }
    } catch (e) {
      console.error("[assistant → intermediary] error", e);
      alert("Failed to create intermediary.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="font-medium">Assistant: Character Lite → Intermediary</div>
          <Button type="button" onClick={handleGenerate} disabled={pending || !slug}>
            {pending ? "Asking Assistant…" : "Generate Intermediary"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">
          Generates an <code>IntermediarySelection.v2</code> from the current CharacterDefinitionLite.
          The result will auto-populate the Compose panel below.
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
