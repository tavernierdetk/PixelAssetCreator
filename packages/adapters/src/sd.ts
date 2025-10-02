import { createLogger } from "@pixelart/log";

const log = createLogger("@adapters/sd");

export type SdTxt2ImgParams = {
  baseURL: string;                // e.g., http://localhost:7860
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps?: number;                 // default 20
  cfgScale?: number;              // default 7.0
  sampler?: string;               // e.g., "DPM++ 2M Karras"
  tiling?: boolean;               // default false
  model?: string;                 // optional model checkpoint name
  timeoutMs?: number;             // default 300_000
};

export async function generateSDImage(p: SdTxt2ImgParams): Promise<Buffer> {
  const {
    baseURL,
    prompt,
    negativePrompt = "",
    width,
    height,
    steps = 20,
    cfgScale = 7,
    sampler = "DPM++ 2M Karras",
    tiling = false,
    model,
    timeoutMs = 300_000,
  } = p;

  if (!baseURL) throw new Error("SD baseURL is required");
  const url = `${baseURL.replace(/\/$/, "")}/sdapi/v1/txt2img`;

  const body: any = {
    prompt,
    negative_prompt: negativePrompt,
    width,
    height,
    steps,
    cfg_scale: cfgScale,
    sampler_name: sampler,
    tiling,
  };
  if (model && model.trim()) {
    body.override_settings = { sd_model_checkpoint: model };
    body.override_settings_restore_after = true;
  }

  log.info({ url, width, height, steps, cfgScale, sampler, tiling, hasNeg: !!negativePrompt, model }, "sd.txt2img start");

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal as any,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error({ status: res.status, text: text.slice(0, 1000) }, "sd.txt2img http_error");
      throw new Error(`sd_http_${res.status}`);
    }
    const json: any = await res.json();
    const b64 = Array.isArray(json?.images) ? json.images[0] : null;
    if (!b64 || typeof b64 !== "string") {
      log.error({ json: JSON.stringify(json).slice(0, 1000) }, "sd.txt2img missing_image");
      throw new Error("sd_missing_image");
    }
    const buf = Buffer.from(b64, "base64");
    log.info({ bytes: buf.length }, "sd.txt2img done");
    return buf;
  } finally {
    clearTimeout(to);
  }
}

export function mapSizeToWH(s?: string): { width: number; height: number } {
  const map: Record<string, [number, number]> = {
    "256x256": [256, 256],
    "512x512": [512, 512],
    "1024x1024": [1024, 1024],
    "1536x1024": [1536, 1024],
    "1024x1536": [1024, 1536],
    "1792x1024": [1792, 1024],
    "1024x1792": [1024, 1792],
  };
  const key = String(s || "1024x1024").toLowerCase();
  const hit = map[key] || map["1024x1024"];
  return { width: hit[0], height: hit[1] };
}
