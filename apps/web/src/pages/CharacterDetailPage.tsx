import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BackHeader } from "@/components/BackHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PortraitsPanel } from "@/components/character/PortraitsPanel";
import { CharacterForm } from "@/components/character/CharacterForm";
import { ULPCPanel } from "@/components/character/ULPCPanel";
import IntermediaryConverter from "@/components/IntermediaryConverter";
import AssistantIntermediaryPanel from "@/components/AssistantIntermediaryPanel";

import type { CharacterDefinitionLite } from "@/types";
import {
  getLiteDef,
  listAssets,
  updateLiteDef,
  enqueuePortrait,
  getJob,
  deleteAsset,
  uploadAsset,
} from "@/lib/api";

function csvParseUnique(input: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export default function CharacterDetailPage() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  // Fetch definition & assets
  const defQ = useQuery({
    queryKey: ["liteDef", slug],
    queryFn: () => getLiteDef(slug),
    enabled: !!slug,
  });

  const assetsQ = useQuery({
    queryKey: ["assets", slug],
    queryFn: () => listAssets(slug),
    enabled: !!slug,
  });

  // Local form state
  const [form, setForm] = useState<CharacterDefinitionLite | null>(null);
  const [traitsText, setTraitsText] = useState("");
  const [valuesText, setValuesText] = useState("");
  const [featuresText, setFeaturesText] = useState("");

  // Assistant output (intermediary)
  const [intermediary, setIntermediary] = useState<any | null>(null);

  useEffect(() => {
    if (defQ.data) {
      const d = defQ.data as CharacterDefinitionLite;
      setForm(d);
      setTraitsText((d.personality?.traits ?? []).join(", "));
      setValuesText((d.personality?.values ?? []).join(", "));
      setFeaturesText((d.physical?.distinctive_features ?? []).join(", "));
    }
  }, [defQ.data]);

  const hasDefinition = Boolean(form);
  const files = (assetsQ.data?.files ?? []) as string[];

  // Portrait state
  const [pending, setPending] = useState<{ portrait?: boolean }>({});
  const [imgBust, setImgBust] = useState<number>(0);

  // Save definition
  const saveM = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("No form loaded");

      const traits = csvParseUnique(traitsText, 6);
      const values = csvParseUnique(valuesText, 5);
      const features = csvParseUnique(featuresText, 6);

      const next: CharacterDefinitionLite = {
        ...form,
        personality: {
          ...form.personality,
          traits,
          values,
        },
        physical: {
          ...form.physical,
          distinctive_features: features,
        },
        identity: { ...form.identity, char_slug: slug }, // enforce slug
      };
      return updateLiteDef(slug, next);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["liteDef", slug] });
    },
  });

  async function pollJobUntilDone(jobId: string, opts?: { timeoutMs?: number; intervalMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 180_000;
    const intervalMs = opts?.intervalMs ?? 1_500;
    const t0 = Date.now();
    let tick = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const j = await getJob(jobId);
      if (j?.state === "completed") return j;
      if (j?.state === "failed") throw new Error("Portrait generation failed");
      if (Date.now() - t0 > timeoutMs) throw new Error("Portrait generation timed out");
      tick++;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // Generate full-art portrait (non-pixel)
  async function handleGeneratePortrait() {
    setPending((p) => ({ ...p, portrait: true }));
    try {
      const { jobId } = await enqueuePortrait(slug);
      await pollJobUntilDone(jobId);
      await qc.invalidateQueries({ queryKey: ["assets", slug] });
      setImgBust(Date.now()); // ensure <img> src changes
    } catch (err) {
      console.error("[portrait] error", err);
      alert((err as Error).message || "Portrait generation failed");
    } finally {
      setPending((p) => ({ ...p, portrait: false }));
    }
  }

  // Upload / Remove hooks (portrait only)
  async function handleUploadPortrait(file: File) {
    await uploadAsset(slug, "portrait", file);
    await qc.invalidateQueries({ queryKey: ["assets", slug] });
    setImgBust(Date.now());
  }
  async function handleRemovePortrait() {
    await deleteAsset(slug, "portrait");
    await qc.invalidateQueries({ queryKey: ["assets", slug] });
    setImgBust(Date.now());
  }

  return (
    <div className="space-y-6">
      <BackHeader
        title="Edit Character"
        right={
          <Button type="button" onClick={() => nav(-1)}>
            ← Back
          </Button>
        }
      />

      {/* Definition editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="font-medium">Character Definition (Lite)</div>
            <Button type="button" onClick={() => saveM.mutate()} disabled={saveM.isPending || !form}>
              {saveM.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!form ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : (
            <CharacterForm
              value={form}
              onChange={setForm}
              traitsText={traitsText}
              onTraitsTextChange={setTraitsText}
              valuesText={valuesText}
              onValuesTextChange={setValuesText}
              featuresText={featuresText}
              onFeaturesTextChange={setFeaturesText}
            />
          )}
        </CardContent>
      </Card>

      {/* Side-by-side: Portrait ⟷ Intermediary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PortraitsPanel
          slug={slug}
          files={files}
          hasDefinition={hasDefinition}
          pending={pending}
          onGeneratePortrait={handleGeneratePortrait}
          onUploadPortrait={handleUploadPortrait}
          onRemovePortrait={handleRemovePortrait}
          cacheBust={imgBust}
        />
        <AssistantIntermediaryPanel
          slug={slug}
          draft={form ?? undefined}
          onIntermediary={(obj) => setIntermediary(obj)}
        />
      </div>

      {/* Intermediary → ULPC (Compose). Driven by the generated intermediary. */}
      <Card>
        <CardHeader>
          <div className="font-medium">Intermediary → ULPC (Compose)</div>
        </CardHeader>
        <CardContent>
          <IntermediaryConverter
            slug={slug}
            intermediary={intermediary}
            onComposed={async () => {
              await qc.invalidateQueries({ queryKey: ["assets", slug] });
            }}
          />
        </CardContent>
      </Card>

      {/* ULPC panel */}
      <ULPCPanel slug={slug} files={files} />
    </div>
  );
}
