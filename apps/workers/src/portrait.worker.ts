import { Worker, Job } from "bullmq";
import { createLogger } from "@pixelart/log";
import { portraitProcessor } from "./processors/portrait.js";

const log = createLogger("@workers/portrait");
const connection = { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } };

export const portraitWorker = new Worker(
  "portrait",
  async (job: Job) => {
    log.info({ jobId: job.id, slug: job.data?.slug }, "job received");
    const rv = await portraitProcessor(job.data);
    log.info({ jobId: job.id, ...rv }, "job completed");
    return rv;
  },
  connection
);

portraitWorker.on("ready", () => log.info("worker ready"));
portraitWorker.on("error", (err) => log.error({ err }, "worker error"));
portraitWorker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, slug: job?.data?.slug, err }, "job failed")
);
portraitWorker.on("closed", () => log.warn("worker closed"));
