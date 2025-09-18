// apps/web/src/components/IntermediaryInspector.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { convertIntermediary } from "@/lib/api";
import CollapsibleCard from "@/components/CollapsibleCard";

type Props = {
  slug: string;
  intermediary: any | null;               // comes from Assistant panel
  onUseBuild: (build: any) => void;       // send to ULPC editor when approved
  onComposed?: () => void | Promise<void>; // optional: refresh assets after compose
};

function pretty(x: unknown) {
  try { return JSON.stringify(x, null, 2); } catch { return ""; }
}

const DEFAULT_ANIMS = ["idle"]; // user can add more later in the ULPC editor

export default function IntermediaryInspector({ slug, intermediary, onUseBuild, onComposed }: Props) {
  const [text, setText] = useState<string>(pretty(intermediary ?? {}));
  const [pending, setPending] = useState(false);
  const [build, setBuild] = useState<any | null>(null);
  const [warnings, setWarnings] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep textarea in sync when a new intermediary arrives
  useEffect(() => {
    setText(pretty(intermediary ?? {}));
    setBuild(null);
    setWarnings(null);
    setError(null);
  }, [intermediary]);

  const hasIntermediary = useMemo(() => {
    try { return Boolean(intermediary && Object.keys(intermediary).length); }
    catch { return false; }
  }, [intermediary]);

  async function handleConvert() {
    setPending(true);
    setError(null);
    setBuild(null);
    setWarnings(null);
    try {
      let obj: any;
      try {
        obj = JSON.parse(text);
      } catch (e: any) {
        throw new Error(`Intermediary JSON is invalid: ${e?.message || "parse error"}`);
      }

      const res = await convertIntermediary({
        slug,
        intermediary: obj,
        animations: DEFAULT_ANIMS,
        compose: true, // writes preview sheet so ULPC preview can refresh
      });

      if (res?.ok) {
        setBuild(res.build ?? null);
        setWarnings(Array.isArray(res.warnings) ? res.warnings : null);
        if (onComposed) await onComposed();
      } else {
        setError(res?.detail || "Conversion failed.");
      }
    } catch (e: any) {
      console.error("[IntermediaryInspector] convert error", e);
      setError(e?.message || "convert-intermediary failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <CollapsibleCard
      title="Intermediary → ULPC (Inspect & Convert)"
      defaultOpen={true}
      right={
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleConvert} disabled={pending || !slug}>
            {pending ? "Converting…" : "Convert"}
          </Button>
          <Button
            type="button"
            onClick={() => build && onUseBuild(build)}
            disabled={!build}
          >
            Use in Editor
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: intermediary JSON */}
        <Card>
          <CardHeader>
            <div className="font-medium">Intermediary JSON</div>
          </CardHeader>
          <CardContent>
            {!hasIntermediary ? (
              <p className="text-sm text-slate-600">
                No intermediary loaded. Generate it with the Assistant panel, then convert here.
              </p>
            ) : (
              <textarea
                className="w-full h-[320px] rounded border p-2 font-mono text-xs"
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            )}
          </CardContent>
        </Card>

        {/* Right: conversion result */}
        <Card>
          <CardHeader>
            <div className="font-medium">Conversion Result</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? (
              <div className="text-sm text-red-600">Error: {error}</div>
            ) : null}

            {warnings?.length ? (
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">Warnings</summary>
                <pre className="mt-2 text-xs bg-yellow-50 p-3 rounded-xl overflow-auto">
                  {pretty(warnings)}
                </pre>
              </details>
            ) : null}

            {build ? (
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">Generated Build JSON</summary>
                <pre className="mt-2 text-xs bg-slate-50 p-3 rounded-xl overflow-auto">
                  {pretty(build)}
                </pre>
              </details>
            ) : (
              <p className="text-sm text-slate-600">
                Convert to view the generated ULPC build JSON here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </CollapsibleCard>
  );
}
