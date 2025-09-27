// apps/api/src/app.ts
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { portraitQ } from "@pixelart/pipeline";

// Local routes (NodeNext requires .js on local imports)
import { health } from "./routes/health.js";
import { admin } from "./routes/admin.js";
import { intake } from "./routes/intake.js";
import { jobs } from "./routes/jobs.js";
import { assets } from "./routes/assets.js";
import { project } from "./routes/project.js";
import { assistantRouter } from "./routes/assistant.js";
import { assistantIntermediaryRouter } from "./routes/assistant.intermediary.js";
import { intermediaryRouter } from "./routes/intermediary.js";
import { godotRouter } from "./routes/godot.js";
import { ulpcRouter } from "./routes/ulpc.js";
import { tilesets } from "./routes/tilesets.js";   // ← add this
import { tilesetDebug } from "./routes/tilesets.js"; // same file; different export




export function createApp(): Express {
  const app = express();

  // Core middleware
  app.use(express.json({ limit: "2mb" }));
  app.use(cors({ origin: process.env.API_CORS_ORIGIN ?? "*" }));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }, // <-- allow <img> from 5173
      // (keep your other helmet defaults)
    })
  );
  app.use(morgan("dev"));

  // Basic rate limiting (configurable via env)
  app.use(
    rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      max: Number(process.env.RATE_LIMIT_MAX ?? 300),
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Health/Readiness
  app.use(health);
  app.get("/health", (_req, res) => res.json({ ok: true })); // legacy alias if needed

  // Optional admin (Bull Board)
  if ((process.env.ADMIN_ENABLED ?? "false") === "true") {
    app.use(admin);
  }


app.use(tilesetDebug);
  // App routes
  app.use(intake);
  app.use(jobs);
  app.use(assets);
  app.use(project);
  app.use(assistantRouter);
  app.use(assistantIntermediaryRouter);
  app.use(intermediaryRouter);
  app.use(godotRouter);
  app.use(ulpcRouter);
  app.use(tilesets); 


  // Unified error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const anyErr = err as any;
    const code = anyErr?.statusCode ?? 500;
    res.status(code).json({
      ok: false,
      code: anyErr?.code ?? "INTERNAL_ERROR",
      message: anyErr?.message ?? "Unexpected error",
    });
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
