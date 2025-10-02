import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Size = { width: number; height: number };

export type GlobalSettings = {
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

export function GlobalSettingsPanel({
  value,
  onChange,
  defaultOpen = true,
}: {
  value: GlobalSettings;
  onChange: (next: GlobalSettings) => void;
  defaultOpen?: boolean;
}) {
  const setRes = (key: keyof GlobalSettings["resolutions"], next: Size) =>
    onChange({ ...value, resolutions: { ...value.resolutions, [key]: next } });

  return (
    <CollapsiblePanel title="Aesthetics & Global Config" defaultOpen={defaultOpen}>
      <div className="grid gap-4">
        <div>
          <Label htmlFor="project_name">Project Name</Label>
          <Input
            id="project_name"
            value={value.project_name ?? ""}
            onChange={(e) => onChange({ ...value, project_name: e.target.value })}
            placeholder="Optional name shown in UI"
          />
        </div>

        <div>
          <Label htmlFor="aesthetics">Aesthetic Description</Label>
          <Textarea
            id="aesthetics"
            value={value.aesthetics}
            onChange={(e) => onChange({ ...value, aesthetics: e.target.value })}
            placeholder="Describe palette, mood, rendering rules, constraints…"
            rows={6}
          />
        </div>

        <fieldset className="grid sm:grid-cols-3 gap-4">
          <SizeField
            label="Portrait Resolution"
            value={value.resolutions.portrait}
            set={(v) => setRes("portrait", v)}
          />
          <SizeField
            label="Idle Resolution"
            value={value.resolutions.idle}
            set={(v) => setRes("idle", v)}
          />
          <SizeField
            label="Animation Frame"
            value={value.resolutions.animation_frame}
            set={(v) => setRes("animation_frame", v)}
          />
        </fieldset>

        <fieldset className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="pixel_scale">Pixel Scale</Label>
            <Input
              id="pixel_scale"
              type="number"
              min={1}
              value={value.pixel_scale ?? 1}
              onChange={(e) => onChange({ ...value, pixel_scale: Math.max(1, Number(e.target.value || 1)) })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="palette_path">Palette Path (optional)</Label>
            <Input
              id="palette_path"
              value={value.palette_path ?? ""}
              onChange={(e) => onChange({ ...value, palette_path: e.target.value })}
              placeholder="e.g., project/palettes/main.gpl (under /assets)"
            />
          </div>
        </fieldset>
      </div>
    </CollapsiblePanel>
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

