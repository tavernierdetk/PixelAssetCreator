import { Worker, Job } from "bullmq";
import { readLiteDef } from "@pixelart/config";
import { generatePortraitStub } from "@pixelart/adapters";
import pino from "pino";

const log = pino({ name: "portrait-worker" });
const connection = { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } };

export const portraitWorker = new Worker(
  "portrait",
  async (job: Job<{ slug: string }>) => {
    const { slug } = job.data;
    log.info({ jobId: job.id, slug }, "portrait: start");

    const def = await readLiteDef(slug);
    const file = await generatePortraitStub(def);

    log.info({ jobId: job.id, file }, "portrait: done");
    return { file }; // ← IMPORTANT
  },
  connection
);

portraitWorker.on("completed", (job, ret) => {
  log.info({ jobId: job.id, ret }, "portrait: completed");
});
portraitWorker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, err }, "portrait: failed");
});
