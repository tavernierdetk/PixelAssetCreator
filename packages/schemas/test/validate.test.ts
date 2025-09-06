import { describe, it, expect } from "vitest";

// ⬇️ Import from source so tests always reflect latest code
import { validateCharacterLite } from "../src/index";

const valid = {
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

describe("CharacterLite schema", () => {
  it("accepts a valid payload", () => {
    const ok = validateCharacterLite(valid);
    if (!ok) {
      // 👀 helpful when it fails
      // console.log so Vitest shows it next to the failure
      console.log("Ajv errors:", validateCharacterLite.errors);
    }
    expect(ok).toBe(true);
  });

  it("rejects when required fields are missing", () => {
    const bad = { identity: { char_name: "X", char_slug: "x" } };
    const ok = validateCharacterLite(bad);
    expect(ok).toBe(false);
    expect(validateCharacterLite.errors?.length).toBeGreaterThan(0);
  });
});
