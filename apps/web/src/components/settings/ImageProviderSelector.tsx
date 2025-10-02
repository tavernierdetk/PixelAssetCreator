import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ImageSettings = {
  provider?: "openai" | "sd" | "stub";
  model?: string;
  quality?: "low" | "standard" | "high";
  sizeDefault?: "256x256" | "512x512" | "1024x1024" | "1536x1024" | "1024x1536" | "1792x1024" | "1024x1792" | "auto";
  backgroundDefault?: "transparent" | "opaque";
  apiKey?: string; // optional per-project key for OpenAI
  sd?: {
    baseURL?: string;
    model?: string;
    sampler?: string;
    steps?: number;
    cfgScale?: number;
    negativePrompt?: string;
    tiling?: boolean;
    timeoutMs?: number;
  };
};

export function ImageProviderSelector({ value, onChange }: { value: ImageSettings; onChange: (next: ImageSettings) => void }) {
  const im = value ?? {};
  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-3 gap-2 items-center">
        <Label>Provider</Label>
        <select
          className="border rounded p-2 text-sm sm:col-span-2"
          value={im.provider ?? "openai"}
          onChange={(e) => onChange({ ...im, provider: e.target.value as any })}
        >
          <option value="openai">OpenAI</option>
          <option value="sd">Stable Diffusion (Local)</option>
          <option value="stub">Stub (Local)</option>
        </select>
      </div>

      {im.provider === "openai" ? (
        <div>
          <Label>OpenAI API Key (project)</Label>
          <Input
            type="password"
            value={im.apiKey ?? ""}
            onChange={(e) => onChange({ ...im, apiKey: e.target.value })}
            placeholder="sk-... (optional; otherwise uses server env)"
          />
        </div>
      ) : null}

      {im.provider !== "sd" ? (
        <div>
          <Label>Model</Label>
          <Input value={im.model ?? "gpt-image-1"} onChange={(e) => onChange({ ...im, model: e.target.value })} placeholder="gpt-image-1" />
        </div>
      ) : null}

      <div className="grid sm:grid-cols-3 gap-2 items-center">
        <Label>Quality</Label>
        <select
          className="border rounded p-2 text-sm sm:col-span-2"
          value={im.quality ?? "low"}
          onChange={(e) => onChange({ ...im, quality: e.target.value as any })}
        >
          <option value="low">Low</option>
          <option value="standard">Standard</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 items-center">
        <Label>Default Size</Label>
        <select
          className="border rounded p-2 text-sm sm:col-span-2"
          value={im.sizeDefault ?? "1024x1024"}
          onChange={(e) => onChange({ ...im, sizeDefault: e.target.value as any })}
        >
          <option>256x256</option>
          <option>512x512</option>
          <option>1024x1024</option>
          <option>1536x1024</option>
          <option>1024x1536</option>
          <option>1792x1024</option>
          <option>1024x1792</option>
          <option>auto</option>
        </select>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 items-center">
        <Label>Default Background</Label>
        <select
          className="border rounded p-2 text-sm sm:col-span-2"
          value={im.backgroundDefault ?? "transparent"}
          onChange={(e) => onChange({ ...im, backgroundDefault: e.target.value as any })}
        >
          <option value="transparent">Transparent</option>
          <option value="opaque">Opaque</option>
        </select>
      </div>

      {im.provider === "sd" ? (
        <div className="grid gap-3 border-t pt-3">
          <div>
            <Label>Base URL</Label>
            <Input
              value={im.sd?.baseURL ?? "http://localhost:7860"}
              onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), baseURL: e.target.value } })}
              placeholder="http://localhost:7860"
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-2 items-center">
            <Label>Timeout (ms)</Label>
            <Input
              type="number"
              className="sm:col-span-2"
              value={im.sd?.timeoutMs ?? 300000}
              onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), timeoutMs: Math.max(10000, Number(e.target.value || 300000)) } })}
            />
          </div>
          <div>
            <Label>Checkpoint Model</Label>
            <Input
              value={im.sd?.model ?? ""}
              onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), model: e.target.value } })}
              placeholder="(optional — overrides server default)"
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-2 items-center">
            <Label>Sampler</Label>
            <Input className="sm:col-span-2" value={im.sd?.sampler ?? "DPM++ 2M Karras"} onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), sampler: e.target.value } })} />
          </div>
          <div className="grid sm:grid-cols-3 gap-2 items-center">
            <Label>Steps</Label>
            <Input
              type="number"
              className="sm:col-span-2"
              value={im.sd?.steps ?? 20}
              onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), steps: Math.max(1, Number(e.target.value || 1)) } })}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-2 items-center">
            <Label>CFG Scale</Label>
            <Input
              type="number"
              step="0.5"
              className="sm:col-span-2"
              value={im.sd?.cfgScale ?? 7}
              onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), cfgScale: Number(e.target.value || 7) } })}
            />
          </div>
          <div>
            <Label>Negative Prompt</Label>
            <Textarea rows={2} value={im.sd?.negativePrompt ?? ""} onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), negativePrompt: e.target.value } })} />
          </div>
          <div className="flex items-center gap-2">
            <input id="sd_tiling" type="checkbox" checked={!!im.sd?.tiling} onChange={(e) => onChange({ ...im, sd: { ...(im.sd ?? {}), tiling: e.target.checked } })} />
            <Label htmlFor="sd_tiling">Enable seamless tiling</Label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
