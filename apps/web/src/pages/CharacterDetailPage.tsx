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

import type { CharacterDefinitionLite } from "@/types";
import {
  getLiteDef,
  listAssets,
  updateLiteDef,
  enqueuePortrait,
  enqueueIdle,
  getJob,
  deleteAsset,
  uploadAsset,
} from "@/lib/api";

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

  useEffect(() => {
    if (defQ.data) {
      const d = defQ.data as CharacterDefinitionLite;
      setForm(d);
      setTraitsText((d.personality?.traits ?? []).join(", "));
    }
  }, [defQ.data]);

  const hasDefinition = Boolean(form);
  const files = (assetsQ.data?.files ?? []) as string[];

  // Pending state for slot actions
  const [pending, setPending] = useState<{ portrait?: boolean; idle?: boolean }>({});
  const [imgBust, setImgBust] = useState<number>(0);

  // Save definition
  const saveM = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("No form loaded");
      const traits = traitsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);
      const next: CharacterDefinitionLite = {
        ...form,
        personality: { ...form.personality, traits },
        identity: { ...form.identity, char_slug: slug }, // enforce slug
      };
      return updateLiteDef(slug, next);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["liteDef", slug] });
    },
  });

  // ---- helpers ----
  async function pollJobUntilDone(jobId: string, opts?: { timeoutMs?: number; intervalMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 180_000;
    const intervalMs = opts?.intervalMs ?? 1_500;
    const t0 = Date.now();
    let tick = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const j = await getJob(jobId);
      console.debug("[portrait] poll", { jobId, tick, state: j?.state, spentMs: Date.now() - t0 });
      if (j?.state === "completed") return j;
      if (j?.state === "failed") throw new Error("Portrait generation failed");
      if (Date.now() - t0 > timeoutMs) throw new Error("Portrait generation timed out");
      tick++;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // Generate portrait
  async function handleGeneratePortrait() {
    setPending((p) => ({ ...p, portrait: true }));
    try {
      console.debug("[portrait] enqueue", { slug });
      const { jobId } = await enqueuePortrait(slug);
      console.debug("[portrait] enqueued", { jobId });

      await pollJobUntilDone(jobId);

      // hard refresh of assets list (log inside listAssets)
      await qc.invalidateQueries({ queryKey: ["assets", slug] });

      // bump image cache-buster so <img> src changes even if name is same
      setImgBust(Date.now());
      console.debug("[portrait] completed; bust image", { bust: imgBust });
    } catch (err) {
      console.error("[portrait] error", err);
      alert((err as Error).message || "Portrait generation failed");
    } finally {
      setPending((p) => ({ ...p, portrait: false }));
    }
  }

  // Generate idle (server may not be implemented yet)
  async function handleGenerateIdle() {
    setPending((p) => ({ ...p, idle: true }));
    try {
      await enqueueIdle(slug); // if 501, this will throw; that's fine during stub phase
      await qc.invalidateQueries({ queryKey: ["assets", slug] });
    } catch (e) {
      console.warn("enqueueIdle not implemented yet:", e);
      alert("Idle generation not implemented yet.");
    } finally {
      setPending((p) => ({ ...p, idle: false }));
    }
  }

  // Upload / Remove hooks
  async function handleUpload(slot: "portrait" | "idle", file: File) {
    await uploadAsset(slug, slot, file);
    await qc.invalidateQueries({ queryKey: ["assets", slug] });
  }
  async function handleRemove(slot: "portrait" | "idle") {
    await deleteAsset(slug, slot);
    await qc.invalidateQueries({ queryKey: ["assets", slug] });
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

      {/* Definition editor — moved to top */}
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
            />
          )}
        </CardContent>
      </Card>

      {/* Portraits */}
      <PortraitsPanel
        slug={slug}
        files={files}
        hasDefinition={hasDefinition}
        pending={pending}
        onGeneratePortrait={handleGeneratePortrait}
        onGenerateIdle={handleGenerateIdle}
        onUpload={handleUpload}
        onRemove={handleRemove}
        cacheBust={imgBust}
      />

      {/* ULPC panel */}
      <ULPCPanel slug={slug} files={files} />

      {/* Intermediary converter — added at bottom */}
      <Card>
        <CardHeader>
          <div className="font-medium">Intermediary → ULPC (Compose)</div>
        </CardHeader>
        <CardContent>
          <IntermediaryConverter />
        </CardContent>
      </Card>
    </div>
  );
}
