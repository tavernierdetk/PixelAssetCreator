import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp, type AppType } from "../src/app.js";

let app: AppType;

beforeAll(() => {
  process.env.NODE_ENV = "test";
  app = createApp();
});

describe("API", () => {
  it("GET /health -> ok", async () => {
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it("POST /validate-lite -> 400 on invalid", async () => {
    const r = await request(app).post("/validate-lite").send({ identity: { char_name: "X" } });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
  });

  it("POST /validate-lite -> 200 on valid", async () => {
    const payload = {
      client_ready: true,
      identity: { char_name: "Test", char_slug: "test" },
      personality: { desire: "x", fear: "y", flaw: "z", traits: ["a", "b"] },
      physical: {
        age_range: "adult",
        height_category: "average",
        build: "average",
        skin_tone: "#885522",
        hair_color: "#222222",
        eye_color: "#336699"
      }
    };
    const r = await request(app).post("/validate-lite").send(payload);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});
