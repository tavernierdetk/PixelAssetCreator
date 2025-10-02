// packages/adapters/src/images.ts
import { createLogger } from "@pixelart/log";
import type { CharacterLite } from "@pixelart/schemas";
import { makeOpenAI } from "./openaiClient.js";
import { generateSDImage, mapSizeToWH } from "./sd.js";

const log = createLogger("@adapters/images");

/** Allowed sizes per OpenAI SDK typings */
export type OpenAIImageSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "1792x1024"
  | "1024x1792"
  | "auto";

/**
 * Generate a full-art portrait via OpenAI Images API.
 * Returns a PNG buffer.
 */
export async function generatePortraitOpenAI(params: {
  prompt: string;
  size?: OpenAIImageSize;            // defaults to 1024x1024
  background?: "transparent";        // only pass when transparent
  quality?: "low" | "standard" | "high"; // "low" maps to API default (standard)
  model?: string;                    // defaults to gpt-image-1
  apiKey?: string;                   // optional per-request api key override
}): Promise<Buffer> {
  const { prompt, background } = params;
  const size = normalizeSize(params.size);
  const quality = params.quality === "low" ? undefined : params.quality; // omit to use baseline
  const model = typeof params.model === "string" && params.model.trim() ? params.model : "gpt-image-1";

  const openai = makeOpenAI(params.apiKey);
  const t0 = Date.now();
  log.info({ size, bg: background ?? "opaque", promptLen: prompt.length, quality: params.quality ?? "standard" }, "images.generate start");

  const res = await openai.images.generate({
    model,
    prompt,
    size,
    ...(background ? { background } : {}),
    ...(quality ? { quality } : {}),
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) {
    const dump = JSON.stringify(res, null, 2).slice(0, 4000);
    log.error({ res: dump }, "No image payload in response");
    throw new Error("OpenAI returned no image data");
  }

  const buf = Buffer.from(b64, "base64");
  log.info({ ms: Date.now() - t0, bytes: buf.length }, "images.generate done");
  return buf;
}

/**
 * Simple stub PNG (32x32) — useful for tests or offline mode.
 */
export async function generatePortraitStub(_: CharacterLite): Promise<Buffer> {
  // 32x32 transparent PNG header+IHDR+empty IDAT+IEND (tiny)
  return Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000020000000200806000000" +
      "5c72a8660000000a49444154789c6360000002000100ffff0300000600" +
      "0557a46a0000000049454e44ae426082",
    "hex"
  );
}

/** Coerces unknown sizes to a valid value with a warning. */
function normalizeSize(s?: string): OpenAIImageSize {
  const allowed: Record<string, OpenAIImageSize> = {
    "256x256": "256x256",
    "512x512": "512x512",
    "1024x1024": "1024x1024",
    "1536x1024": "1536x1024",
    "1024x1536": "1024x1536",
    "1792x1024": "1792x1024",
    "1024x1792": "1024x1792",
    "auto": "auto"
  };
  if (!s) return "1024x1024";
  const key = String(s).toLowerCase();
  if (allowed[key]) return allowed[key];
  log.warn({ requested: s }, "Unsupported image size; defaulting to 1024x1024");
  return "1024x1024";
}

// ─────────────────────────── Generic provider facade ───────────────────────────
export type ImageProvider = "openai" | "sd" | "stub";

export async function generateImage(params: {
  provider: ImageProvider;
  prompt: string;
  model?: string;
  size?: OpenAIImageSize;
  quality?: "low" | "standard" | "high";
  background?: "transparent";
  openaiApiKey?: string; // optional per-request api key override
  sd?: {
    baseURL: string;
    sampler?: string;
    steps?: number;
    cfgScale?: number;
    negativePrompt?: string;
    tiling?: boolean;
    timeoutMs?: number;
  };
}): Promise<Buffer> {
  if (params.provider === "stub") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return generatePortraitStub({} as any);
  }
  if (params.provider === "sd") {
    const wh = mapSizeToWH(params.size);
    return generateSDImage({
      baseURL: params.sd?.baseURL || process.env.SD_BASE_URL || "http://localhost:7860",
      prompt: params.prompt,
      negativePrompt: params.sd?.negativePrompt,
      width: wh.width,
      height: wh.height,
      steps: params.sd?.steps,
      cfgScale: params.sd?.cfgScale,
      sampler: params.sd?.sampler,
      tiling: params.sd?.tiling,
      model: params.model,
      timeoutMs: params.sd?.timeoutMs,
    });
  }
  // Default provider: openai
  return generatePortraitOpenAI({
    prompt: params.prompt,
    size: params.size,
    quality: params.quality,
    background: params.background,
    model: params.model,
    apiKey: params.openaiApiKey,
  });
}
