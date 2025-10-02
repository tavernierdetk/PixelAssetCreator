import { Worker, Job } from "bullmq";
import { createLogger } from "@pixelart/log";
import { tilesetProcessor } from "./processors/tileset.js";
import { tilesetDir } from "@pixelart/config";
import fs from "node:fs/promises";

const log = createLogger("@workers/tileset");
const connection = { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } };

type TilesetJob = {
  slug: string;
  pattern: "blob47" | "coast16"; // extend as patterns grow
  material?: string;
  mode?: "direct" | "mask" | "procedural";
  paletteName?: string;
  // coast16 extras
  materialA?: string;
  materialB?: string;
  vehiclesA?: string[];
  vehiclesB?: string[];
  // procedural overrides
  proceduralSettings?: {
    tileSize?: number;
    bandWidth?: number;
    cornerStyle?: "stepped"|"quarter"|"square";
    transitionMode?: "texture";
    textureScale?: number;
  };
};

export const tilesetWorker = new Worker(
  "tileset",
  async (job: Job<TilesetJob>) => {
    log.info({ jobId: job.id, slug: job.data?.slug, pattern: job.data?.pattern }, "tileset: job received");
    const result = await tilesetProcessor(job.data);
    log.info({ jobId: job.id, sheet: (result as any)?.sheetPath }, "tileset: job completed");
    return result as any;
  },
  connection
);

tilesetWorker.on("ready", () => log.info("tileset: worker ready"));
tilesetWorker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err }, "tileset: job failed");
  // Append debug to slug directory if possible
  try {
    const slug = (job?.data as any)?.slug as string;
    if (slug) {
      const line = `${new Date().toISOString()} worker_failed job=${job?.id} error=${(err as any)?.message}\n`;
      fs.appendFile(`${tilesetDir(slug)}/debug.log`, line, "utf8").catch(() => {});
    }
  } catch {}
});
tilesetWorker.on("closed", () => log.warn("tileset: worker closed"));
