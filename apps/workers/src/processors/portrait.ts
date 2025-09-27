// /Users/alexandredube-cote/entropy/pixelart-backbone/apps/workers/src/processors/portrait.ts
import path from "node:path";
import fs from "node:fs/promises";
import { createLogger } from "@pixelart/log";
import { readLiteDef, readProjectSettings, charDir, ensureDir } from "@pixelart/config";
import { buildPortraitPrompt } from "@pixelart/pipeline";
import { generatePortraitOpenAI } from "@pixelart/adapters";

const log = createLogger("@workers/portrait-processor");

export async function portraitProcessor(data: { slug: string }) {
  const { slug } = data;
  log.info({ slug }, "processor start");

  const def = await readLiteDef(slug);
  const settings = await readProjectSettings();

  const prompt = buildPortraitPrompt(def, settings as any);
  log.debug({ slug, promptLen: prompt.length }, "prompt built");

  const png = await generatePortraitOpenAI({
    prompt,
    size: (process.env.IMAGE_SIZE as any) || "1024x1536",
    background: process.env.IMAGE_TRANSPARENT_BG ? "transparent" : undefined
  });

  const dir = await charDir(slug);
  await ensureDir(dir);
  const outPath = path.join(dir, `high_res_portrait_${slug}.png`);
  await writeAtomic(outPath, png);

  log.info({ slug, outPath, bytes: png.length }, "portrait written");
  return { outPath, bytes: png.length };
}

async function writeAtomic(p: string, buf: Buffer) {
  const tmp = `${p}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, p);
}
