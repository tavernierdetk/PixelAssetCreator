import { Worker, Job } from "bullmq";
import OpenAI from "openai";
import pino from "pino";
import { readLiteDef, charDir, ensureDir, readProjectSettings } from "@pixelart/config";
import { buildIdlePrompt } from "@pixelart/pipeline";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const log = pino({ name: "idle-worker" });
const connection = { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } };

type ProjectSettings = {
  openai?: { apiKey?: string };
  image?: {
    model?: string;
    // allow "512x512" etc, but don't be overly strict
    size?: string;
    idleSize?: string;
    background?: string;
  };
  resolutions?: {
    idle?: { width: number; height: number };
    portrait?: { width: number; height: number };
    animation_frame?: { width: number; height: number };
  };
};


export const idleWorker = new Worker(
  "idle",
  async (job: Job<{ slug: string }>) => {
    const { slug } = job.data;
    log.info({ jobId: job.id, slug }, "idle: start");

    const def = await readLiteDef(slug);
    const rawSettings = await readProjectSettings();
    // Cast to a partial so all fields remain optional
    const settings = (rawSettings ?? {}) as Partial<ProjectSettings>;



    const apiKey = settings?.openai?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing (settings.openai.apiKey or env)");

    const client = new OpenAI({ apiKey });
    const prompt = buildIdlePrompt(def, settings);

    const model  = settings?.image?.model ?? "gpt-image-1";
    const size =
        settings?.image?.idleSize ??
        settings?.image?.size ??
        (settings?.resolutions?.idle
        ? `${settings.resolutions.idle.width}x${settings.resolutions.idle.height}`
        : "512x512");
const bg    = settings?.image?.background ?? "transparent";
    const start = Date.now();
    const resp = await client.images.generate({
      model,
      prompt,
      background: bg === "transparent" ? "transparent" : undefined,
    });

    const b64 = resp.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI image response missing data[0].b64_json");

    const buf = Buffer.from(b64, "base64");
    const dir = charDir(slug);
    await ensureDir(dir);
    const file = join(dir, `idle_${Date.now()}.png`);
    await fs.writeFile(file, buf);

    log.info({ jobId: job.id, ms: Date.now() - start, model, size, file }, "idle: done");
    return { file };
  },
  connection
);

idleWorker.on("completed", (job, ret) => {
  log.info({ jobId: job.id, ret }, "idle: completed");
});
idleWorker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err }, "idle: failed");
});
