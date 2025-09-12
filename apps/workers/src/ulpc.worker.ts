// apps/workers/src/ulpc.worker.ts
import { Worker } from "bullmq";
import pino from "pino";
import ulpcProcessor from "./processors/ulpc.js";

const log = pino({ name: "@workers/ulpc", transport: { target: "pino-pretty" }});

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

export const ulpcWorker = new Worker(
  "ulpc",
  async (job) => {
    log.info({ msg: "job received", jobId: job.id, dataKeys: Object.keys(job.data ?? {}) });
    return ulpcProcessor(job);
  },
  { connection }
);

ulpcWorker.on("ready", () => log.info({ msg: "worker ready" }));
ulpcWorker.on("failed", (job, err) =>
  log.error({ msg: "job failed", jobId: job?.id, err: { message: err.message, stack: err.stack } })
);
ulpcWorker.on("completed", (job) =>
  log.info({ msg: "job completed", jobId: job?.id, returnvalue: job?.returnvalue })
);
