import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type PromptDefaults = {
  style?: string;
  tileability?: string;
  units?: string;
  alpha?: string;
  output?: string;
};

export function TilesetPromptDefaultsPanel({
  value,
  onChange,
  defaultOpen = true,
}: {
  value: PromptDefaults;
  onChange: (next: PromptDefaults) => void;
  defaultOpen?: boolean;
}) {
  const pd = value ?? {};
  return (
    <CollapsiblePanel title="Tileset Prompt Defaults (v2)" defaultOpen={defaultOpen}>
      <div className="grid gap-3">
        <div>
          <Label>[STYLE]</Label>
          <Textarea
            value={pd.style ?? ""}
            onChange={(e) => onChange({ ...pd, style: e.target.value })}
            rows={2}
            placeholder="Top-down pixel art; crisp clusters; minimal dithering; no text/watermark."
          />
        </div>
        <div>
          <Label>[TILEABILITY]</Label>
          <Textarea
            value={pd.tileability ?? ""}
            onChange={(e) => onChange({ ...pd, tileability: e.target.value })}
            rows={2}
            placeholder="Seamless when cropped to 32×32 and repeated."
          />
        </div>
        <div>
          <Label>[UNITS]</Label>
          <Textarea
            value={pd.units ?? ""}
            onChange={(e) => onChange({ ...pd, units: e.target.value })}
            rows={2}
            placeholder="1 tile-pixel ≈ 3% of tile width (≈32 image px on a 1024×1024 canvas)."
          />
        </div>
        <div>
          <Label>[ALPHA]</Label>
          <Textarea
            value={pd.alpha ?? ""}
            onChange={(e) => onChange({ ...pd, alpha: e.target.value })}
            rows={2}
            placeholder="Canvas must have an alpha channel. Any area not covered is fully transparent (no black fill, no halos, no AA)."
          />
        </div>
        <div>
          <Label>[OUTPUT]</Label>
          <Textarea
            value={pd.output ?? ""}
            onChange={(e) => onChange({ ...pd, output: e.target.value })}
            rows={2}
            placeholder="Single image, 1024×1024, orthographic top-down; avoid banding/directional streaks."
          />
        </div>
      </div>
    </CollapsiblePanel>
  );
}

