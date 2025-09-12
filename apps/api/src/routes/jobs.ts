import { Router, type Request, type Response } from "express";
import { portraitQ as portraitQueue, idleQ as idleQueue } from "@pixelart/pipeline";


export const jobs: import("express").Router = Router();


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

jobs.get("/jobs/:id", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("ETag", `${Date.now()}-${Math.random()}`);

    const id = req.params.id;
    const job = await portraitQueue.getJob(id);

    if (!job) {
      // If the job was removed immediately after completion, treat it as "gone"
      // so clients can stop polling and just refresh assets.
      return res.status(200).json({ id, state: "gone", progress: 100, returnvalue: null });
    }

    const state = await job.getState();
    const progress = job.progress ?? 0;
    const returnvalue = job.returnvalue ?? null;

    res.json({ id, name: job.name, state, progress, returnvalue });
  } catch (err) {
    next(err);
  }
});

jobs.get("/debug/portrait-counts", async (_req, res) => {
  const counts = await portraitQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  res.set("Cache-Control", "no-store");
  res.json(counts);
});