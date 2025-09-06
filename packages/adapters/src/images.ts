import sharp from "sharp";
import type { CharacterLite } from "@pixelart/schemas";
import { ensureDir, charDir } from "@pixelart/config";
import { join } from "node:path";

export type PortraitOptions = { size?: number; bg?: string };

export async function generatePortraitStub(
  def: CharacterLite,
  opts: PortraitOptions = {}
) {
  const size = opts.size ?? 1024;
  const bg = opts.bg ?? "#222";

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bg}"/>
    <g font-family="sans-serif" fill="#fff">
      <text x="50%" y="42%" font-size="${Math.round(size * 0.06)}" text-anchor="middle">PixelArt Portrait Stub</text>
      <text x="50%" y="52%" font-size="${Math.round(size * 0.08)}" text-anchor="middle">${def.identity.char_name}</text>
      <text x="50%" y="62%" font-size="${Math.round(size * 0.04)}" text-anchor="middle">${def.personality.traits?.slice(0,3).join(" • ") ?? ""}</text>
    </g>
  </svg>`.trim();

  const dir = charDir(def.identity.char_slug);
  await ensureDir(dir);
  const file = join(dir, `high_res_portrait_${def.identity.char_slug}.png`);

  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}
