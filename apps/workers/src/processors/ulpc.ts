// apps/workers/src/processors/ulpc.ts
import { Job } from "bullmq";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createLogger } from "@pixelart/log";
import { composeULPC, composeULPCExport } from "@pixelart/sprite-compose";
import { makeUlpcBuildValidator } from "@pixelart/validators";
import { writeUlpcBuild } from "@pixelart/config";

const log = createLogger("@workers/ulpc-processor");

const ASSET_ROOT =
  process.env.ASSET_ROOT ?? path.resolve(process.cwd(), "..", "..", "assets", "characters");

async function readBuildIfMissing(slug: string, supplied: any | null) {
  if (supplied) return supplied;
  const dir = path.join(ASSET_ROOT, slug);
  const candidates = [
    path.join(dir, "ulpc.json"),
    path.join(dir, `ulpc_build_${slug}.json`),
  ];

  for (const file of candidates) {
    try {
      const txt = await fs.readFile(file, "utf8");
      const obj = JSON.parse(txt);
      log.info({ msg: "loaded.build.file", file });
      return obj;
    } catch {
      continue;
    }
  }

  throw new Error(`ULPC build JSON not provided and not found for slug ${slug}`);
}

export default async function ulpcProcessor(job: Job) {
  const slug: string = job.data?.slug;
  if (!slug) throw new Error("ULPC processor: missing slug");

  const build = await readBuildIfMissing(slug, job.data?.build ?? null);

  // 1) Validate against current schema while we’re evolving it:
  //    strip 'output' (schema may not know zero_pad/fps/split_by_frame/both yet)
  const validateBuild = makeUlpcBuildValidator<any>();
  const { output, ...buildSansOutput } = build ?? {};
  validateBuild(buildSansOutput as any);

  try {
    await writeUlpcBuild(slug, build);
    log.info({ msg: "ulpc.persisted", slug });
  } catch (err: any) {
    log.error({ msg: "ulpc.persist_failed", slug, error: err?.message });
  }

  // 2) Decide path: single-sheet compose vs multi-export (sheets + frames)
  const mode = output?.mode as string | undefined;
  const outBaseDir = path.join(ASSET_ROOT, slug);

  if (mode && mode !== "full") {
    // Multi-animation export path (writes sheets and per-frame folders under outBaseDir)
    log.info({ msg: "export.start", slug, mode, outBaseDir });
    const exported = await composeULPCExport({ build, outBaseDir, slug });
    log.info({ msg: "export.done", slug, exported });
    return {
      ok: true,
      export: {
        sheets: exported.sheets ?? null,
        frames: exported.frames ?? null,
        manifestPath: exported.manifestPath ?? null,
      },
    };
  }

  // Legacy/single output path
  const outPath = path.join(outBaseDir, `ulpc_spritesheet_${slug}.png`);
  log.info({ msg: "compose.start", slug, outPath });
  const result = await composeULPC(build, outPath);
  log.info({ msg: "sprite.written", slug, outPath: result.outPath, bytes: result.bytes });
  return { file: path.basename(outPath), bytes: result.bytes };
}
