import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use compiled API (ESM)
const cfg = await import("../dist/index.js");
const { writeLiteDef, readLiteDef } = cfg;

const slug = "tester_" + Math.random().toString(36).slice(2, 7);
const valid = {
  client_ready: true,
  identity: { char_name: "Tester", char_slug: slug },
  personality: { desire: "x", fear: "y", flaw: "z", traits: ["a", "b"] },
  physical: {
    age_range: "adult",
    height_category: "average",
    build: "average",
    skin_tone: "tan",
    hair_color: "brown",
    eye_color: "green"
  }
};

let root!: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "pixelart-"));
  process.env.ASSET_ROOT = root;
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("storage write/read", () => {
  it("writes and reads the lite definition", async () => {
    const file = await writeLiteDef(slug, valid);
    expect(file).toContain(slug);
    const got = await readLiteDef(slug);
    expect(got.identity.char_slug).toBe(slug);
    expect(got.personality.traits.length).toBe(2);
  });
});
