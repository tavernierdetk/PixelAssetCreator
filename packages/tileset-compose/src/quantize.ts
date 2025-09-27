import sharp from "sharp";
import type { RGB } from "./types.js";

export function nearestColor(palette: RGB[], r: number, g: number, b: number): RGB {
  let best = palette[0], bestD = Infinity;
  for (const [pr, pg, pb] of palette) {
    const d = (r-pr)*(r-pr) + (g-pg)*(g-pg) + (b-pb)*(b-pb);
    if (d < bestD) { bestD = d; best = [pr, pg, pb]; }
  }
  return best;
}

/** Quantize entire image buffer to a fixed palette (no dithering). Keeps alpha. */
export async function quantizeToPalette(buf: Buffer, palette: RGB[]): Promise<Buffer> {
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  for (let i=0; i<data.length; i+=4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 8) { out[i]=0; out[i+1]=0; out[i+2]=0; out[i+3]=0; continue; }
    const [nr, ng, nb] = nearestColor(palette, r, g, b);
    out[i]=nr; out[i+1]=ng; out[i+2]=nb; out[i+3]=255;
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}
