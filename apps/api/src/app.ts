import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import * as schemas from "@pixelart/schemas";          // ← robust to CJS or ESM
import type { CharacterLite } from "@pixelart/schemas";
import { portraitQ } from "@pixelart/pipeline";
import { intake } from "./routes/intake.js";
import { jobs } from "./routes/jobs.js";
import { assets } from "./routes/assets.js";



// works whether @pixelart/schemas is CJS (default) or ESM (named)
const validateCharacterLite =
  (schemas as any).default?.validateCharacterLite ??
  (schemas as any).validateCharacterLite;

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(cors());
  app.use(helmet());
  app.use(morgan("dev"));
  app.use(intake);
  app.use(jobs);
  app.use(assets);

  app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

  app.post("/validate-lite", (req: Request, res: Response) => {
    const ok = validateCharacterLite(req.body as CharacterLite);
    if (!ok) return res.status(400).json({ ok: false, errors: validateCharacterLite.errors });
    return res.json({ ok: true });
  });

  app.post("/pipeline/:slug/portrait", async (req: Request, res: Response) => {
    const { slug } = req.params as Record<string, string>;
    const job = await portraitQ.add("portrait", { slug });
    return res.status(202).json({ jobId: job.id });
  });

  app.use(intake);
  return app;
}

export type AppType = ReturnType<typeof createApp>;
