#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defsDir = path.resolve(__dirname, "../vendor/ulpc-src/sheet_definitions");
const spritesDir = path.resolve(__dirname, "../vendor/ulpc-src/spritesheets");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const entries = await fs.readdir(defsDir);
  let updated = 0;
  let skipped = 0;
  let missing = 0;
  let zeroAnim = 0;

  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const defPath = path.join(defsDir, name);
    const raw = await fs.readFile(defPath, "utf8");
    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      console.warn(`Skipping ${name}: invalid JSON (${err?.message ?? err})`);
      continue;
    }

    if (Array.isArray(json.animations) && json.animations.length) {
      skipped += 1;
      continue;
    }

    const layer1 = json?.layer_1;
    if (!layer1 || typeof layer1 !== "object") {
      missing += 1;
      continue;
    }

    const pathCandidates = Object.entries(layer1)
      .filter(([key, value]) => typeof value === "string" && key.toLowerCase() !== "zpos")
      .map(([, value]) => value.trim())
      .filter(Boolean);

    if (!pathCandidates.length) {
      missing += 1;
      continue;
    }

    let animations = [];
    for (const candidate of pathCandidates) {
      const normalized = candidate.replace(/^\/+|\/+$/g, "");
      const segments = normalized.split("/").filter(Boolean);
      if (!segments.length) continue;
      const folder = path.join(spritesDir, ...segments);
      try {
        const stat = await fs.stat(folder);
        if (!stat.isDirectory()) continue;
        const dirs = await fs.readdir(folder, { withFileTypes: true });
        const anims = dirs
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .filter((name) => !name.startsWith("."));
        if (anims.length) {
          animations = anims.sort((a, b) => a.localeCompare(b));
          break;
        }
      } catch (err) {
        console.warn(`Missing spritesheet directory for ${name}: ${folder}`);
      }
    }

    if (!animations.length) {
      zeroAnim += 1;
      continue;
    }

    json.animations = animations;
    updated += 1;

    if (!DRY_RUN) {
      const next = `${JSON.stringify(json, null, 2)}\n`;
      await fs.writeFile(defPath, next, "utf8");
    }
  }

  console.log(`Processed ${entries.length} definitions`);
  console.log(`  updated: ${updated}`);
  console.log(`  skipped (already had animations): ${skipped}`);
  console.log(`  missing paths: ${missing}`);
  console.log(`  no animations found: ${zeroAnim}`);
  if (DRY_RUN) {
    console.log("(dry run — no files written)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
