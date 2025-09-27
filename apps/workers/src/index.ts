//Users/alexandredube-cote/entropy/pixelart-backbone/apps/workers/src/index.ts
import "dotenv/config";

// start real workers (each worker registers itself on import)
import "./portrait.worker";
import "./idle.worker";
import "./ulpc.worker";


import pino from "pino";
const logger = pino({ transport: { target: "pino-pretty" } });

logger.info({
  msg: "Workers started",
  redis: process.env.REDIS_URL ?? "redis://localhost:6379",
  assetRoot: process.env.ASSET_ROOT ?? "<default>",
  ulpcDefs: process.env.ULPC_SHEET_DEFS ?? "<missing>",   // ← add this
});
