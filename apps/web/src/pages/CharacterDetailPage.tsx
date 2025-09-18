import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BackHeader } from "@/components/BackHeader";
import CollapsibleCard from "@/components/CollapsibleCard";

import { PortraitsPanel } from "@/components/character/PortraitsPanel";
import { CharacterForm } from "@/components/character/CharacterForm";
import { ULPCPanel } from "@/components/character/ULPCPanel";
import AssistantIntermediaryPanel from "@/components/AssistantIntermediaryPanel";
import IntermediaryInspector from "@/components/IntermediaryInspector";

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

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────
export default function CharacterDetailPage() {
  const { slug = "" } = useParams();
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

  // Pending + cache-bust for images
  const [pending, setPending] = useState<{ portrait?: boolean }>({});
  const [imgBust, setImgBust] = useState<number>(0);

  // Assistant intermediary + ULPC build draft (structured editor input)
  const [intermediary, setIntermediary] = useState<any | null>(null);
  const [ulpcBuildDraft, setUlpcBuildDraft] = useState<any>({
    schema: "ulpc.build/1.0",
    generator: { project: "Universal-LPC-Spritesheet-Character-Generator", version: "local" },
    animations: ["idle"],
    output: { mode: "full" },
    layers: [],
  });

  const displayName = (form?.identity?.char_name || (defQ.data as any)?.identity?.char_name || "").trim() || slug;


  // Save definition
  const saveM = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("No form loaded");

      const toArr = (s: string, max: number) =>
        s.split(",").map((t) => t.trim()).filter(Boolean).slice(0, max);

      const traits = toArr(traitsText, 8);
      const values = toArr(valuesText, 5);
      const features = toArr(featuresText, 6);

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
        identity: { ...form.identity, char_slug: slug },
        client_ready: form.client_ready,
      };
      return updateLiteDef(slug, next);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["liteDef", slug] });
    },
  });

  // Helpers
  async function pollJobUntilDone(jobId: string, opts?: { timeoutMs?: number; intervalMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 180_000;
    const intervalMs = opts?.intervalMs ?? 1_500;
    const t0 = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const j = await getJob(jobId);
      if (j?.state === "completed") return j;
      if (j?.state === "failed") throw new Error("Portrait generation failed");
      if (Date.now() - t0 > timeoutMs) throw new Error("Portrait generation timed out");
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // Portrait actions
  async function handleGeneratePortrait() {
    setPending((p) => ({ ...p, portrait: true }));
    try {
      const { jobId } = await enqueuePortrait(slug);
      await pollJobUntilDone(jobId);
      await qc.invalidateQueries({ queryKey: ["assets", slug] });
      setImgBust(Date.now());
    } catch (err) {
      console.error("[portrait] error", err);
      alert((err as Error).message || "Portrait generation failed");
    } finally {
      setPending((p) => ({ ...p, portrait: false }));
    }
  }

  async function onUploadPortrait(file: File) {
    await uploadAsset(slug, "portrait", file);
    await qc.invalidateQueries({ queryKey: ["assets", slug] });
    setImgBust(Date.now());
  }
  async function onRemovePortrait() {
    await deleteAsset(slug, "portrait");
    await qc.invalidateQueries({ queryKey: ["assets", slug] });
    setImgBust(Date.now());
  }

  async function refreshAssets() {
    await qc.invalidateQueries({ queryKey: ["assets", slug] });
  }

  const buildOverrideMemo = useMemo(() => ulpcBuildDraft, [ulpcBuildDraft]);

  // ───────────────────────────────── UI ─────────────────────────────────
  return (
    <div className="space-y-6">
      <BackHeader title={`Character: ${displayName}`} />

      {/* Character Form (collapsible) */}
      <CollapsibleCard
        title="Character Form"
        right={
          <button
            type="button"
            onClick={() => saveM.mutate()}
            disabled={!form || saveM.isPending}
            className="px-3 py-2 rounded-xl border text-sm"
          >
            {saveM.isPending ? "Saving…" : "Save"}
          </button>
        }
      >
        {form ? (
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
        ) : (
          <div className="text-sm text-slate-600">Loading…</div>
        )}
      </CollapsibleCard>

      {/* Portrait + Assistant Intermediary (collapsible group) */}
      <CollapsibleCard title="Art & Intermediary">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PortraitsPanel
            slug={slug}
            files={files}
            hasDefinition={hasDefinition}
            pending={pending}
            onGeneratePortrait={handleGeneratePortrait}
            onUploadPortrait={onUploadPortrait}
            onRemovePortrait={onRemovePortrait}
            cacheBust={imgBust}
          />

          <AssistantIntermediaryPanel
            slug={slug}
            draft={form ?? undefined}
            onIntermediary={(obj) => setIntermediary(obj)}
          />
        </div>
      </CollapsibleCard>

      {/* Temporary Intermediary → ULPC inspector (collapsible) */}
      <IntermediaryInspector
        slug={slug}
        intermediary={intermediary}
        onUseBuild={(b) => setUlpcBuildDraft(b)}
        onComposed={refreshAssets}
      />

      {/* ULPC editor + preview (collapsible) */}
      <CollapsibleCard title="ULPC Spritesheet / Export">
        <ULPCPanel
          slug={slug}
          files={files}
          buildDraft={buildOverrideMemo}
          onChangeBuild={setUlpcBuildDraft}
        />
      </CollapsibleCard>
    </div>
  );
}
