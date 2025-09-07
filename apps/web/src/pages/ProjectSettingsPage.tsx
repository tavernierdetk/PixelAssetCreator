import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BackHeader } from "@/components/BackHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getProjectSettings, updateProjectSettings } from "@/lib/api";

type Size = { width: number; height: number };
type ProjectSettings = {
  project_name?: string;
  aesthetics: string;
  pixel_scale?: number;
  resolutions: {
    portrait: Size;
    idle: Size;
    animation_frame: Size;
  };
  palette_path?: string;
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
      <BackHeader title="Project Settings" />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="font-medium">Aesthetics & Global Config</div>
            <Button type="button" onClick={() => saveM.mutate()} disabled={saveM.isPending || !form}>
              {saveM.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : (
            <div className="grid gap-4">
              <div>
                <Label htmlFor="project_name">Project Name</Label>
                <Input
                  id="project_name"
                  value={form!.project_name ?? ""}
                  onChange={(e) => setForm({ ...form!, project_name: e.target.value })}
                  placeholder="Optional name shown in UI"
                />
              </div>

              <div>
                <Label htmlFor="aesthetics">Aesthetic Description</Label>
                <Textarea
                  id="aesthetics"
                  value={form!.aesthetics}
                  onChange={(e) => setForm({ ...form!, aesthetics: e.target.value })}
                  placeholder="Describe palette, mood, rendering rules, constraints…"
                  rows={6}
                />
              </div>

              <fieldset className="grid sm:grid-cols-3 gap-4">
                <SizeField
                  label="Portrait Resolution"
                  value={form!.resolutions.portrait}
                  set={(v) => setForm({ ...form!, resolutions: { ...form!.resolutions, portrait: v } })}
                />
                <SizeField
                  label="Idle Resolution"
                  value={form!.resolutions.idle}
                  set={(v) => setForm({ ...form!, resolutions: { ...form!.resolutions, idle: v } })}
                />
                <SizeField
                  label="Animation Frame"
                  value={form!.resolutions.animation_frame}
                  set={(v) => setForm({ ...form!, resolutions: { ...form!.resolutions, animation_frame: v } })}
                />
              </fieldset>

              <fieldset className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="pixel_scale">Pixel Scale</Label>
                  <Input
                    id="pixel_scale"
                    type="number"
                    min={1}
                    value={form!.pixel_scale ?? 1}
                    onChange={(e) =>
                      setForm({ ...form!, pixel_scale: Math.max(1, Number(e.target.value || 1)) })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="palette_path">Palette Path (optional)</Label>
                  <Input
                    id="palette_path"
                    value={form!.palette_path ?? ""}
                    onChange={(e) => setForm({ ...form!, palette_path: e.target.value })}
                    placeholder="e.g., project/palettes/main.gpl (under /assets)"
                  />
                </div>
              </fieldset>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SizeField({
  label,
  value,
  set,
}: {
  label: string;
  value: Size;
  set: (v: Size) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          value={value.width}
          onChange={(e) => set({ ...value, width: Math.max(1, Number(e.target.value || 1)) })}
          aria-label={`${label} width`}
          placeholder="W"
        />
        <Input
          type="number"
          min={1}
          value={value.height}
          onChange={(e) => set({ ...value, height: Math.max(1, Number(e.target.value || 1)) })}
          aria-label={`${label} height`}
          placeholder="H"
        />
      </div>
    </div>
  );
}
