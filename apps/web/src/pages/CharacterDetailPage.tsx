import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BackHeader } from "@/components/BackHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PortraitsPanel } from "@/components/character/PortraitsPanel";
import { CharacterForm } from "@/components/character/CharacterForm";

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

  // Save definition
  const saveM = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("No form loaded");
      const traits = traitsText.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8);
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

  // Generate portrait
  async function handleGeneratePortrait() {
    setPending((p) => ({ ...p, portrait: true }));
    try {
      const { jobId } = await enqueuePortrait(slug);
      // simple poll loop
      for (let i = 0; i < 30; i++) {
        // eslint-disable-next-line no-await-in-loop
        const j = await getJob(jobId);
        if (j?.state === "completed" || j?.state === "failed") break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1500));
      }
      await qc.invalidateQueries({ queryKey: ["assets", slug] });
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
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
