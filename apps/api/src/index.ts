import "dotenv/config";

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import type { Options as PinoHttpOptions, HttpLogger } from "pino-http";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "http";

import * as schemas from "@pixelart/schemas";
import type { CharacterLite } from "@pixelart/schemas";
import { portraitQ } from "@pixelart/pipeline";

// Local routes (NodeNext/ESM requires .js extension in source imports)
import { intake } from "./routes/intake.js";
import { jobs } from "./routes/jobs.js";
import { assets } from "./routes/assets.js";
import { health } from "./routes/health.js";
import { admin } from "./routes/admin.js";

// Works for both CJS (default export) and ESM (named)
const validateCharacterLite =
  (schemas as any).default?.validateCharacterLite ??
  (schemas as any).validateCharacterLite;

export function createApp() {
  const app = express();

  // Structured logging with request IDs (safe call signature for pino-http)
const httpLogger: HttpLogger = (
  pinoHttp as unknown as (opts?: PinoHttpOptions) => HttpLogger
)({
  genReqId: (req: IncomingMessage) => {
    const h = req.headers?.["x-request-id"];
    const id = Array.isArray(h) ? h[0] : h;
    return id || randomUUID();
  },
});
app.use(httpLogger);

  // Core middleware
  app.use(express.json({ limit: "2mb" }));
  app.use(cors({ origin: process.env.API_CORS_ORIGIN ?? "*" }));
  app.use(helmet());

  // Basic rate limiting (tweak via env)
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
  app.get("/health", (_req, res) => res.json({ ok: true })); // legacy alias

  // Optional admin (Bull Board)
  if ((process.env.ADMIN_ENABLED ?? "false") === "true") {
    app.use(admin);
  }

  // Validation endpoint (handy for UI / dev)
  app.post("/validate-lite", (req: Request, res: Response) => {
    const ok = validateCharacterLite(req.body as CharacterLite);
    if (!ok) {
      const details = (validateCharacterLite.errors ?? []).map((e: any) => ({
        path: e.instancePath || "/",
        message: e.message,
        keyword: e.keyword,
      }));
      return res
        .status(400)
        .json({ ok: false, code: "VALIDATION_ERROR", details });
    }
    return res.json({ ok: true });
  });

  // Enqueue portrait generation
  app.post(
    "/pipeline/:slug/portrait",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { slug } = req.params as Record<string, string>;
        const job = await portraitQ.add("portrait", {
          slug,
          reqId: (req as any).id,
        });
        return res.status(202).json({ jobId: job.id });
      } catch (e: unknown) {
        next(e as any);
      }
    }
  );

  // App routes
  app.use(intake);
  app.use(jobs);
  app.use(assets);

  // Unified error handler
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const anyErr = err as any;
      const code = anyErr?.statusCode ?? 500;
      res.status(code).json({
        ok: false,
        code: anyErr?.code ?? "INTERNAL_ERROR",
        message: anyErr?.message ?? "Unexpected error",
      });
    }
  );

  return app;
}

// Auto-start server in dev/normal runs (not during tests)
if (process.env.NODE_ENV !== "test") {
  const app = createApp();
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API http://localhost:${port}`);
  });
}

export type AppType = ReturnType<typeof createApp>;
