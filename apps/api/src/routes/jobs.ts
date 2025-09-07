import { Router, type Request, type Response } from "express";
import { Queue } from "bullmq";

const q = new Queue("portrait", { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } });

export const jobs: import("express").Router = Router();


jobs.get("/jobs/:id", async (req: Request, res: Response) => {
  const job = await q.getJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "Not found" });
  const s = await job.getState();
  res.json({
    id: job.id,
    name: job.name,
    state: s,
    progress: job.progress,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason
  });
});
