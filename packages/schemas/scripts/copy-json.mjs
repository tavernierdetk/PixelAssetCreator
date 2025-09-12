// copies ONLY .json files from src -> dist, preserving folders
import { mkdir, readdir, cp as copy } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = new URL("../src/", import.meta.url);
const DEST = new URL("../dist/", import.meta.url);

async function copyJson(dirUrl, rel = "") {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  for (const e of entries) {
    const nextUrl = new URL(e.name + (e.isDirectory() ? "/" : ""), dirUrl);
    const relPath = rel + e.name + (e.isDirectory() ? "/" : "");
    if (e.isDirectory()) {
      await mkdir(new URL(relPath, DEST), { recursive: true });
      await copyJson(nextUrl, relPath);
    } else if (e.name.endsWith(".json")) {
      await mkdir(new URL(rel, DEST), { recursive: true });
      await copy(nextUrl, new URL(relPath, DEST));
    }
  }
}

await mkdir(DEST, { recursive: true });
await copyJson(SRC);
