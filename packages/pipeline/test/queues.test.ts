import { describe, it, expect, beforeAll } from "vitest";
import Redis from "ioredis";
import * as pipeline from "../src/index";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
let hasRedis = false;

beforeAll(async () => {
  try {
    const r = new Redis(url);
    await r.ping();
    await r.quit();
    hasRedis = true;
  } catch {
    hasRedis = false;
  }
});

describe("queues", () => {
  (hasRedis ? it : it.skip)("enqueues a portrait job", async () => {
    const job = await pipeline.portraitQ.add("portrait", { slug: "it_slug" });
    expect(job.id).toBeDefined();
    await job.remove();
  });
});
