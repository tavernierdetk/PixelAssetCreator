// apps/api/test/health.test.ts
import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../src/index"; // if you export app from index

describe("health", () => {
  it("ok", async () => {
    const res = await request("http://localhost:4000").get("/health");
    expect(res.status).toBe(200);
  });
});
