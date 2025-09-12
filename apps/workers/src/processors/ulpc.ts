import { Job } from "bullmq";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createLogger } from "@pixelart/log";
import { composeULPC } from "@pixelart/sprite-compose";
import { makeUlpcBuildValidator } from "@pixelart/validators"; 


const log = createLogger("@workers/ulpc-processor");

const ASSET_ROOT =
  process.env.ASSET_ROOT ?? path.resolve(process.cwd(), "..", "..", "assets", "characters");

async function readBuildIfMissing(slug: string, supplied: any | null) {
  if (supplied) return supplied;
  const file = path.join(ASSET_ROOT, slug, `ulpc_build_${slug}.json`);
  try {
    const txt = await fs.readFile(file, "utf8");
    const obj = JSON.parse(txt);
    log.info({ msg: "loaded.build.file", file });
    return obj;
  } catch {
    throw new Error(`ULPC build JSON not provided and not found at ${file}`);
  }
}

export default async function ulpcProcessor(job: Job) {
  const slug: string = job.data?.slug;
  const build = await readBuildIfMissing(slug, job.data?.build ?? null);
  const validateBuild = makeUlpcBuildValidator<any>();
  validateBuild(build);

  if (!slug) throw new Error("ULPC processor: missing slug");

  const outPath = path.join(ASSET_ROOT, slug, `ulpc_spritesheet_${slug}.png`);
  log.info({ msg: "processor.start", slug, outPath });

  const result = await composeULPC(build, outPath);

  log.info({ msg: "sprite.written", slug, outPath: result.outPath, bytes: result.bytes });
  return { file: path.basename(outPath), bytes: result.bytes };
}
