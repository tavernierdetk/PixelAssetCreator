import pino from "pino";
import { readLiteDef } from "@pixelart/config";
import { generatePortraitStub } from "@pixelart/adapters";

const log = pino({ name: "portrait-processor" });

export type PortraitJobData = { slug: string };

/** Pure processor logic (no BullMQ). Easy to unit test. */
export async function processPortrait(data: PortraitJobData) {
  const { slug } = data;
  log.info({ slug }, "processPortrait: start");
  const def = await readLiteDef(slug);
  const file = await generatePortraitStub(def);
  log.info({ slug, file }, "processPortrait: done");
  return { file };
}
