//Users/alexandredube-cote/entropy/pixelart-backbone/apps/web/src/pages/ProjectSettingsPage.tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/ui/button";
import { getProjectSettings, updateProjectSettings } from "@/lib/api";
import { type ImageSettings } from "@/components/settings/ImageProviderSelector";
import { type LlmSettings } from "@/components/settings/LlmProviderSelector";
import { ImageSettingsPanel } from "@/components/settings/ImageSettingsPanel";
import { LlmSettingsPanel } from "@/components/settings/LlmSettingsPanel";
import { GlobalSettingsPanel, type GlobalSettings } from "@/components/settings/GlobalSettingsPanel";
import { TilesetPromptDefaultsPanel, type PromptDefaults } from "@/components/settings/TilesetPromptDefaultsPanel";

type ProjectSettings = {
  project_name?: string;
  aesthetics: string;
  pixel_scale?: number;
  resolutions: {
    portrait: { width: number; height: number };
    idle: { width: number; height: number };
    animation_frame: { width: number; height: number };
  };
  palette_path?: string;
  // Tileset prompt defaults (v2)
  promptDefaults?: PromptDefaults;
  images?: {
    provider?: "openai" | "sd" | "stub";
    model?: string;
    quality?: "low" | "standard" | "high";
    sizeDefault?: "256x256" | "512x512" | "1024x1024" | "1536x1024" | "1024x1536" | "1792x1024" | "1024x1792" | "auto";
    backgroundDefault?: "transparent" | "opaque";
    sd?: {
      baseURL?: string;
      model?: string;
      sampler?: string;
      steps?: number;
      cfgScale?: number;
      negativePrompt?: string;
      tiling?: boolean;
    };
  };
  llm?: LlmSettings;
};

export default function ProjectSettingsPage() {
  const q = useQuery({
    queryKey: ["projectSettings"],
    queryFn: () => getProjectSettings(),
  });

  const [form, setForm] = useState<ProjectSettings | null>(null);
  useEffect(() => {
    if (q.data?.settings) setForm(q.data.settings as ProjectSettings);
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("No form");
      return updateProjectSettings(form);
    },
  });

  const loading = q.isLoading || !form;

  return (
    <div className="space-y-6">
      <BackHeader
        title="Project Settings"
        right={<Button type="button" onClick={() => saveM.mutate()} disabled={saveM.isPending || !form}>{saveM.isPending ? "Saving…" : "Save Settings"}</Button>}
      />

      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : (
        <div className="grid gap-4">
          <GlobalSettingsPanel
            value={form as GlobalSettings}
            onChange={(next) => setForm({ ...(form as any), ...next })}
            defaultOpen
          />

          <TilesetPromptDefaultsPanel
            value={(form!.promptDefaults ?? {}) as PromptDefaults}
            onChange={(next) => setForm({ ...form!, promptDefaults: next })}
            defaultOpen
          />

          <ImageSettingsPanel
            value={(form!.images ?? {}) as ImageSettings}
            onChange={(next) => setForm({ ...form!, images: next })}
            defaultOpen
          />

          <LlmSettingsPanel
            value={(form!.llm ?? {}) as LlmSettings}
            onChange={(next) => setForm({ ...form!, llm: next })}
            defaultOpen={false}
          />
        </div>
      )}
    </div>
  );
}
