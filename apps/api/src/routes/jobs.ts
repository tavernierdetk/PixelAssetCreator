import { Router, type Request, type Response } from "express";
import { portraitQ as portraitQueue, idleQ as idleQueue, ulpcQ, tilesetQ } from "@pixelart/pipeline";
import type { Job, Queue } from "bullmq";

import pino from "pino";

const log = pino({ name: "@api/jobs", transport: { target: "pino-pretty" }});


export const jobs: import("express").Router = Router();
const queues: Queue[] = [portraitQueue, idleQueue, ulpcQ, tilesetQ].filter(Boolean) as Queue[];


async function findJob(id: string): Promise<Job | null> {
  for (const q of queues) {
    const j = await q.getJob(id);
    if (j) return j;
  }
  return null;
}

// Enqueue portrait generation
jobs.post("/pipeline/:slug/portrait", async (req: Request, res: Response) => {
  const { slug } = req.params as Record<string, string>;
  const job = await portraitQueue.add("portrait", { slug }, {
    attempts: 1,
    backoff: { type: "exponential", delay: 2000 },
    // keep completed jobs for a little while so the UI can poll them
    removeOnComplete: { age: 300, count: 1000 }, // keep 5 minutes or last 1000
    removeOnFail: false,
  });
  res.status(202).json({ jobId: job.id });
});

// Enqueue idle generation
jobs.post("/pipeline/:slug/idle", async (req: Request, res: Response) => {
  const { slug } = req.params as Record<string, string>;
  const job = await idleQueue.add("idle", { slug });
  res.status(202).json({ jobId: job.id });
});

jobs.post("/pipeline/:slug/ulpc", async (req, res) => {
  const slug = req.params.slug;
  const build = req.body?.build ?? null;

  const job = await ulpcQ.add("ulpc", { slug, build }, {
    attempts: 1,                 // avoid the failed→retry window
    removeOnComplete: 60,        // keep for 60s; adjust to taste
    removeOnFail: 3600
  });
  res.status(202).json({ ok: true, jobId: job.id });
});

jobs.get("/jobs/:id", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  const id = req.params.id;
  const job = await findJob(id);
  if (!job) return res.status(404).json({ ok: false, error: "not_found" });

  const state = await job.getState();

  // include retry + debug info so the client can make a better call
  res.json({
    ok: true,
    id: job.id,
    name: job.name,
    state,                       // waiting|active|completed|failed|delayed
    progress: job.progress ?? 0,
    returnvalue: job.returnvalue ?? null,
    attemptsMade: job.attemptsMade ?? 0,
    attempts: job.opts?.attempts ?? 1,
    failedReason: (job as any).failedReason ?? null,
    finishedOn: job.finishedOn ?? null,
    processedOn: job.processedOn ?? null
  });
});

jobs.get("/debug/portrait-counts", async (_req, res) => {
  const counts = await portraitQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  res.set("Cache-Control", "no-store");
  res.json(counts);
});
