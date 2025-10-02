import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createLogger } from "@pixelart/log";
import { writeManifest, promptHash } from "../manifest.js";
import type { TilesetComposeResult, TilesetManifest, RGB } from "../types.js";
import { ROMAN_STEAMPUNK_32 } from "../palettes.js";

const log = createLogger("@tileset/proc-coast16");

type CornerStyle = "stepped" | "quarter" | "square";
type TransitionMode = "texture"; // v1: respect T alpha only
type LineStyle = "straight_line" | "wavy_smooth" | "craggy" | "zigzag";

type Img = { data: Buffer; width: number; height: number; channels: number } | null;

async function loadImage(p?: string | null): Promise<Img> {
  if (!p) return null;
  try {
    const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels };
  } catch {
    return null;
  }
}

function sampleWrap(img: Img, u: number, v: number, scale = 1): [number, number, number, number] {
  if (!img) return [0, 0, 0, 0];
  const { data, width, height, channels } = img;
  const U = Math.floor(((u * scale) % width + width) % width);
  const V = Math.floor(((v * scale) % height + height) % height);
  const idx = (V * width + U) * channels;
  return [data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0, data[idx + 3] ?? 255];
}

function over(bg: [number, number, number, number], fg: [number, number, number, number]): [number, number, number, number] {
  const ba = bg[3] / 255, fa = fg[3] / 255;
  const outA = fa + ba * (1 - fa);
  if (outA <= 0) return [0, 0, 0, 0];
  const r = Math.round((fg[0] * fa + bg[0] * ba * (1 - fa)) / outA);
  const g = Math.round((fg[1] * fa + bg[1] * ba * (1 - fa)) / outA);
  const b = Math.round((fg[2] * fa + bg[2] * ba * (1 - fa)) / outA);
  return [r, g, b, Math.round(outA * 255)];
}

function edgesFromNibble(nibble: number) {
  // nibble bits: NW(8), NE(4), SE(2), SW(1)
  const NW = (nibble & 0b1000) !== 0;
  const NE = (nibble & 0b0100) !== 0;
  const SE = (nibble & 0b0010) !== 0;
  const SW = (nibble & 0b0001) !== 0;
  return {
    N: Number(NW && NE),
    E: Number(NE && SE),
    S: Number(SE && SW),
    W: Number(SW && NW),
  } as { N: 0|1; E:0|1; S:0|1; W:0|1 };
}

type Pt = { x: number; y: number };
type Endpoint = { type: "edge_mid" | "corner"; edge?: "N"|"E"|"S"|"W"; corner?: "NW"|"NE"|"SE"|"SW" };
type TileRecipe = {
  id: number; name: string;
  from: Endpoint; to: Endpoint;
  cornerPolicy?: "rounded" | "bevel";
  lineStyle?: LineStyle;
  // Probe point that should belong to A sector
  aProbe: Pt;
  fill?: 'A' | 'B';
  multi?: {
    lines: Array<{ from: Endpoint; to: Endpoint; cornerPolicy?: "rounded"|"bevel" }>;
    combiner: 'equal' | 'xor';
  };
};

function edgeMid(N: number, edge: "N"|"E"|"S"|"W"): Pt {
  const m = (N - 1) / 2;
  if (edge === "N") return { x: m, y: 0 };
  if (edge === "S") return { x: m, y: N - 1 };
  if (edge === "W") return { x: 0, y: m };
  return { x: N - 1, y: m };
}
function cornerPt(N: number, c: "NW"|"NE"|"SE"|"SW"): Pt {
  if (c === "NW") return { x: 0, y: 0 };
  if (c === "NE") return { x: N - 1, y: 0 };
  if (c === "SE") return { x: N - 1, y: N - 1 };
  return { x: 0, y: N - 1 };
}
function endpointPt(N: number, e: Endpoint): Pt {
  return e.type === "edge_mid" ? edgeMid(N, e.edge!) : cornerPt(N, e.corner!);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function length(a: Pt, b: Pt) { const dx = b.x - a.x, dy = b.y - a.y; return Math.hypot(dx, dy); }
function normalize(dx: number, dy: number): [number, number] { const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }

// Build base polyline between endpoints, inserting a corner turn if needed
function buildBasePolyline(N: number, from: Endpoint, to: Endpoint, policy: "rounded"|"bevel" = "bevel"): Pt[] {
  const a = endpointPt(N, from), b = endpointPt(N, to);
  // If horizontal or vertical aligned edge mids → single segment
  if (a.x === b.x || a.y === b.y) return [a, b];
  // Perpendicular connection: route via tile center (classic wedge), not corner
  const c = { x: (N - 1) / 2, y: (N - 1) / 2 };
  if (policy === "rounded") {
    // Smooth through center using two control points biased toward center
    const mid1 = { x: lerp(a.x, c.x, 0.6), y: lerp(a.y, c.y, 0.6) };
    const mid2 = { x: lerp(c.x, b.x, 0.6), y: lerp(c.y, b.y, 0.6) };
    return [a, mid1, c, mid2, b];
  }
  return [a, c, b];
}

// Modulate polyline by lineStyle (returns densified polyline)
function modulatePolyline(base: Pt[], style: LineStyle, params: { amplitude?: number; wavelength?: number; jitter?: number; stairStep?: number }): Pt[] {
  if (style === "straight_line") return base;
  const amp = params.amplitude ?? 1.5;
  const wav = Math.max(1, params.wavelength ?? 8);
  const jit = params.jitter ?? 1;
  const step = Math.max(1, Math.round(params.stairStep ?? 1));

  const out: Pt[] = [];
  for (let si = 0; si < base.length - 1; si++) {
    const p0 = base[si], p1 = base[si + 1];
    const dx = p1.x - p0.x, dy = p1.y - p0.y; const segLen = Math.hypot(dx, dy) || 1;
    const [ux, uy] = normalize(dx, dy);
    // normal (left-of-dir) in screen coords (y down): (uy, -ux)
    const nx = uy, ny = -ux;
    const samples = Math.max(2, Math.ceil(segLen));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      let off = 0;
      if (style === "wavy_smooth") {
        const phase = (t * segLen) / wav * (2 * Math.PI);
        off = amp * Math.sin(phase);
      } else if (style === "zigzag") {
        const tri = 2 * Math.abs((t * segLen / wav) % 1 - 0.5) - 0.5; // -0.5..0.5
        off = amp * tri * 2;
      } else if (style === "craggy") {
        const k = Math.floor((t * segLen) / Math.max(1, wav / 2));
        const v = ((k * 9301 + 49297) % 233280) / 233280; // LCG-based deterministic
        const s = v < 0.5 ? -1 : 1;
        off = s * jit;
      }
      // taper to ensure exact endpoints
      off *= Math.sin(Math.PI * t);
      // stair step quantization
      let x = p0.x + dx * t + nx * off;
      let y = p0.y + dy * t + ny * off;
      if (step > 1 && (style === "craggy")) {
        x = Math.round(x / step) * step;
        y = Math.round(y / step) * step;
      }
      if (out.length === 0 || x !== out[out.length - 1].x || y !== out[out.length - 1].y) out.push({ x, y });
    }
  }
  return out;
}

// Signed distance to polyline; positive if point is to the left of nearest segment
function signedDistanceToPolyline(x: number, y: number, pl: Pt[]): number {
  let minD2 = Infinity; let sign = 1;
  for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1]; const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx*vx + vy*vy || 1; const t = Math.max(0, Math.min(1, ((x - a.x)*vx + (y - a.y)*vy) / L2));
    const qx = a.x + vx * t, qy = a.y + vy * t; const dx = x - qx, dy = y - qy;
    const d2 = dx*dx + dy*dy;
    if (d2 < minD2) { minD2 = d2; sign = Math.sign(vx * (y - qy) - vy * (x - qx)) || 1; }
  }
  return Math.sign(sign) * Math.sqrt(minD2);
}

function defaultStyleParams(style: LineStyle) {
  if (style === "wavy_smooth") return { amplitude: 1.5, wavelength: 8 };
  if (style === "zigzag") return { amplitude: 2.0, wavelength: 8 };
  if (style === "craggy") return { jitter: 1, stairStep: 1 };
  return {};
}

function recipeForNib(N: number, nib: number, globalStyle: LineStyle, cornerStyle: CornerStyle): TileRecipe {
  const style = globalStyle;
  const rounded = cornerStyle === "quarter" ? "rounded" : "bevel";
  const rec = (from: Endpoint, to: Endpoint, aProbe: Pt, cp: "rounded"|"bevel" = "bevel"): TileRecipe => ({ id: nib, name: `mask_${nib.toString(2).padStart(4,"0")}`, from, to, aProbe, cornerPolicy: cp, lineStyle: style });
  const m = (N - 1) / 2;
  // Explicit 16-tile mapping (classic wedges + splits).
  switch (nib) {
    case 0:  return rec({ type: "edge_mid", edge: "W" }, { type: "edge_mid", edge: "E" }, { x: m, y: 1 });            // A top
    case 1:  return rec({ type: "edge_mid", edge: "W" }, { type: "edge_mid", edge: "E" }, { x: m, y: N - 2 });        // A bottom
    case 2:  return rec({ type: "edge_mid", edge: "N" }, { type: "edge_mid", edge: "S" }, { x: 1, y: m });             // A left
    case 3:  return rec({ type: "edge_mid", edge: "N" }, { type: "edge_mid", edge: "S" }, { x: N - 2, y: m });         // A right
    case 4:  return rec({ type: "edge_mid", edge: "W" }, { type: "edge_mid", edge: "N" }, { x: 1, y: 1 }, rounded);     // NW wedge
    case 5:  return rec({ type: "edge_mid", edge: "N" }, { type: "edge_mid", edge: "E" }, { x: N - 2, y: 1 }, rounded); // NE wedge
    case 6:  return rec({ type: "edge_mid", edge: "E" }, { type: "edge_mid", edge: "S" }, { x: N - 2, y: N - 2 }, rounded); // SE wedge
    case 7:  return rec({ type: "edge_mid", edge: "S" }, { type: "edge_mid", edge: "W" }, { x: 1, y: N - 2 }, rounded); // SW wedge
    // 8–11: inverse wedges (A everywhere except the named corner)
    // B wedge at NW (so A elsewhere): path W_mid→C→N_mid, but probe on SE
    case 8:  return rec({ type: "edge_mid", edge: "W" }, { type: "edge_mid", edge: "N" }, { x: N - 3, y: N - 3 }, rounded);
    // B wedge at NE → A elsewhere
    case 9:  return rec({ type: "edge_mid", edge: "N" }, { type: "edge_mid", edge: "E" }, { x: 2, y: N - 3 }, rounded);
    // B wedge at SE → A elsewhere
    case 10: return rec({ type: "edge_mid", edge: "E" }, { type: "edge_mid", edge: "S" }, { x: 2, y: 2 }, rounded);
    // B wedge at SW → A elsewhere
    case 11: return rec({ type: "edge_mid", edge: "S" }, { type: "edge_mid", edge: "W" }, { x: N - 3, y: 2 }, rounded);
    // 12: A in NW & SE — combine horizontal and vertical splits with 'equal' combiner
    case 12: return { id: nib, name: `mask_${nib.toString(2).padStart(4,"0")}`, from: { type: "edge_mid", edge: "W" }, to: { type: "edge_mid", edge: "E" }, aProbe: { x: 2, y: 2 }, cornerPolicy: rounded, lineStyle: style, multi: { combiner: 'equal', lines: [ { from: { type: 'edge_mid', edge: 'W' }, to: { type: 'edge_mid', edge: 'E' } }, { from: { type: 'edge_mid', edge: 'N' }, to: { type: 'edge_mid', edge: 'S' } } ] } };
    // 13: A in NE & SW — combine splits with 'xor' combiner
    case 13: return { id: nib, name: `mask_${nib.toString(2).padStart(4,"0")}`, from: { type: "edge_mid", edge: "W" }, to: { type: "edge_mid", edge: "E" }, aProbe: { x: N - 3, y: 2 }, cornerPolicy: rounded, lineStyle: style, multi: { combiner: 'xor', lines: [ { from: { type: 'edge_mid', edge: 'W' }, to: { type: 'edge_mid', edge: 'E' } }, { from: { type: 'edge_mid', edge: 'N' }, to: { type: 'edge_mid', edge: 'S' } } ] } };
    // 14: fully A, 15: fully B — handled as fill in the main loop
    case 14: return { id: nib, name: `mask_${nib.toString(2).padStart(4,"0")}`, from: { type: "edge_mid", edge: "W" }, to: { type: "edge_mid", edge: "E" }, aProbe: { x: m, y: m }, cornerPolicy: "bevel", lineStyle: style, fill: 'A' };
    case 15: return { id: nib, name: `mask_${nib.toString(2).padStart(4,"0")}`, from: { type: "edge_mid", edge: "W" }, to: { type: "edge_mid", edge: "E" }, aProbe: { x: m, y: m }, cornerPolicy: "bevel", lineStyle: style, fill: 'B' };
    default: return rec({ type: "edge_mid", edge: "W" }, { type: "edge_mid", edge: "E" }, { x: m, y: 1 });
  }
}

function inCornerStepped(N: number, x: number, y: number, corner: "NW"|"NE"|"SE"|"SW", thr: number): boolean {
  switch (corner) {
    case "NW": return (x + y) < thr;
    case "NE": return ((N - 1 - x) + y) < thr;
    case "SE": return ((N - 1 - x) + (N - 1 - y)) < thr;
    case "SW": return (x + (N - 1 - y)) < thr;
  }
}

function inCorner(style: CornerStyle, N: number, x: number, y: number, corner: "NW"|"NE"|"SE"|"SW", thr: number): boolean {
  if (thr <= 0) return false;
  if (style === "stepped") return inCornerStepped(N, x, y, corner, thr);
  if (style === "square") {
    if (corner === "NW") return x < thr && y < thr;
    if (corner === "NE") return x >= N - thr && y < thr;
    if (corner === "SE") return x >= N - thr && y >= N - thr;
    return x < thr && y >= N - thr;
  }
  // quarter-circle
  const r = thr;
  if (corner === "NW") { const dx = (x) - (r - 1); const dy = (y) - (r - 1); return (dx*dx + dy*dy) < r*r; }
  if (corner === "NE") { const dx = (x) - (N - r); const dy = (y) - (r - 1); return (dx*dx + dy*dy) < r*r; }
  if (corner === "SE") { const dx = (x) - (N - r); const dy = (y) - (N - r); return (dx*dx + dy*dy) < r*r; }
  const dx = (x) - (r - 1); const dy = (y) - (N - r); return (dx*dx + dy*dy) < r*r;
}

export async function generateCoast16Procedural(params: {
  outDir: string;
  textures: { A?: string | null; B?: string | null; T?: string | null };
  settings?: { tileSize?: number; bandWidth?: number; cornerStyle?: CornerStyle; transitionMode?: TransitionMode; textureScale?: number; paletteName?: string };
}): Promise<TilesetComposeResult> {
  const outDir = params.outDir;
  await fs.mkdir(outDir, { recursive: true });
  const tilesDir = path.join(outDir, "tiles_32");
  await fs.mkdir(tilesDir, { recursive: true });

  const tileSize = params.settings?.tileSize ?? 32;
  const bandWidth = params.settings?.bandWidth ?? 4;
  const cornerStyle = params.settings?.cornerStyle ?? "stepped";
  const lineStyle: LineStyle = (params.settings as any)?.lineStyle ?? "straight_line";
  const transitionMode: TransitionMode = params.settings?.transitionMode ?? "texture";
  const textureScale = params.settings?.textureScale ?? 1.0;
  const paletteName = params.settings?.paletteName ?? "roman_steampunk";

  const pathA = params.textures.A ? path.resolve(outDir, params.textures.A) : null;
  const pathB = params.textures.B ? path.resolve(outDir, params.textures.B) : null;
  const pathT = params.textures.T ? path.resolve(outDir, params.textures.T) : null;
  const imgA = await loadImage(pathA);
  const imgB = await loadImage(pathB);
  const imgT = await loadImage(pathT);
  try {
    const line = `${new Date().toISOString()} proc_inputs A=${pathA || 'none'} ${imgA ? `(${imgA.width}x${imgA.height})` : '(missing)'} B=${pathB || 'none'} ${imgB ? `(${imgB.width}x${imgB.height})` : '(missing)'} T=${pathT || 'none'} ${imgT ? `(${imgT.width}x${imgT.height})` : '(missing)'}\n`;
    await fs.appendFile(path.join(outDir, "debug.log"), line, "utf8");
  } catch {}

  const bExterior = Math.max(1, bandWidth * 2);

  const tiles: { id: number; name: string; file: string }[] = [];
  const nibs: number[] = Array.from({ length: 16 }, (_, i) => i);

  for (const nib of nibs) {
    const id = nib;
    const name = `mask_${(nib >>> 0).toString(2).padStart(4, "0")}`;
    const recipe = recipeForNib(tileSize, nib, lineStyle, cornerStyle);
    if (recipe.fill) {
      // Short-circuit fill
      const buf = Buffer.alloc(tileSize * tileSize * 4);
      let alphaSum = 0;
      for (let y = 0; y < tileSize; y++) for (let x = 0; x < tileSize; x++) {
        const idx = (y * tileSize + x) * 4;
        const pix = recipe.fill === 'A' ? sampleWrap(imgA, x, y, textureScale) : sampleWrap(imgB, x, y, textureScale);
        buf[idx] = pix[0]; buf[idx+1] = pix[1]; buf[idx+2] = pix[2]; buf[idx+3] = pix[3]; alphaSum += pix[3];
      }
      const tilePath = path.join(tilesDir, `${id.toString().padStart(2, "0")}_${name}_32.png`);
      await sharp(buf, { raw: { width: tileSize, height: tileSize, channels: 4 } }).png().toFile(tilePath);
      tiles.push({ id, name, file: path.relative(outDir, tilePath).replaceAll("\\", "/") });
      try { await fs.appendFile(path.join(outDir, "debug.log"), `${new Date().toISOString()} tile_${id}_${name}_fill=${recipe.fill} alphaSum=${alphaSum}\n`, "utf8"); } catch {}
      continue;
    }
    // Multi-line case (opposite corners): combine two splits
    if (recipe.multi) {
      const bases = recipe.multi.lines.map(l => buildBasePolyline(tileSize, l.from, l.to, (l.cornerPolicy ?? "bevel")));
      const mods = bases.map(b => modulatePolyline(b, recipe.lineStyle || lineStyle, defaultStyleParams(recipe.lineStyle || lineStyle)));
      // Precompute probe signs per base
      const probeSigns = bases.map(b => Math.sign(signedDistanceToPolyline(recipe.aProbe.x, recipe.aProbe.y, b)) || 1);
      const buf = Buffer.alloc(tileSize * tileSize * 4);
      let alphaSum = 0;
      for (let y = 0; y < tileSize; y++) for (let x = 0; x < tileSize; x++) {
        const idx = (y * tileSize + x) * 4;
        const sds = mods.map(m => signedDistanceToPolyline(x + 0.5, y + 0.5, m));
        const inBand = sds.some(d => Math.abs(d) <= bandWidth/2);
        const sideMatches = sds.map((d, i) => (d >= 0) === (probeSigns[i] >= 0));
        // equal: A if all sideMatches equal (for 2 lines, sideMatches[0]===sideMatches[1])
        // xor: A if sideMatches differ
        const Acond = recipe.multi!.combiner === 'equal' ? (sideMatches[0] === sideMatches[1]) : (sideMatches[0] !== sideMatches[1]);
        let outPix: [number, number, number, number] = Acond ? sampleWrap(imgA, x, y, textureScale) : sampleWrap(imgB, x, y, textureScale);
        if (transitionMode === 'texture' && inBand) {
          const tPix = sampleWrap(imgT, x, y, textureScale);
          outPix = over(outPix, tPix);
        }
        buf[idx] = outPix[0]; buf[idx+1] = outPix[1]; buf[idx+2] = outPix[2]; buf[idx+3] = outPix[3]; alphaSum += outPix[3];
      }
      const tilePath = path.join(tilesDir, `${id.toString().padStart(2, "0")}_${name}_32.png`);
      await sharp(buf, { raw: { width: tileSize, height: tileSize, channels: 4 } }).png().toFile(tilePath);
      tiles.push({ id, name, file: path.relative(outDir, tilePath).replaceAll("\\", "/") });
      try { await fs.appendFile(path.join(outDir, "debug.log"), `${new Date().toISOString()} tile_${id}_${name}_multi alphaSum=${alphaSum}\n`, "utf8"); } catch {}
      continue;
    }
    const base = buildBasePolyline(tileSize, recipe.from, recipe.to, recipe.cornerPolicy === "rounded" ? "rounded" : "bevel");
    // Debug: for wedge-like paths (multi-segment base), log endpoints and center point
    try {
      if (base.length >= 3) {
        const cpt = { x: (tileSize - 1) / 2, y: (tileSize - 1) / 2 };
        let ci = 0; let cd = Infinity;
        for (let i = 0; i < base.length; i++) {
          const dx = base[i].x - cpt.x, dy = base[i].y - cpt.y; const d = dx*dx + dy*dy;
          if (d < cd) { cd = d; ci = i; }
        }
        const a = base[0], mid = base[ci], bpt = base[base.length - 1];
        const line = `${new Date().toISOString()} base_pts id=${id} name=${name} a=(${a.x.toFixed(2)},${a.y.toFixed(2)}) c=(${mid.x.toFixed(2)},${mid.y.toFixed(2)}) b=(${bpt.x.toFixed(2)},${bpt.y.toFixed(2)})\n`;
        await fs.appendFile(path.join(outDir, "debug.log"), line, "utf8");
      }
    } catch {}
    const mod = modulatePolyline(base, recipe.lineStyle || lineStyle, defaultStyleParams(recipe.lineStyle || lineStyle));
    const buf = Buffer.alloc(tileSize * tileSize * 4);

    let alphaSum = 0;
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const idx = (y * tileSize + x) * 4;
        const sd = signedDistanceToPolyline(x + 0.5, y + 0.5, mod);
        const inBand = Math.abs(sd) <= bandWidth / 2;
        // Determine which side should be A using probe measured on base polyline (style‑invariant)
        const probeSign = signedDistanceToPolyline(recipe.aProbe.x, recipe.aProbe.y, base);
        const aIsPositive = probeSign >= 0;
        const isA = aIsPositive ? (sd >= 0 && !inBand) : (sd <= 0 && !inBand);
        const isB = !inBand && !isA;

        let outPix: [number, number, number, number] = isA ? sampleWrap(imgA, x, y, textureScale) : sampleWrap(imgB, x, y, textureScale);
        if (transitionMode === "texture" && inBand) {
          const tPix = sampleWrap(imgT, x, y, textureScale);
          outPix = over(outPix, tPix);
        }

        buf[idx] = outPix[0]; buf[idx + 1] = outPix[1]; buf[idx + 2] = outPix[2]; buf[idx + 3] = outPix[3];
        alphaSum += outPix[3];
      }
    }

    const tilePath = path.join(tilesDir, `${id.toString().padStart(2, "0")}_${name}_32.png`);
    await sharp(buf, { raw: { width: tileSize, height: tileSize, channels: 4 } }).png().toFile(tilePath);
    tiles.push({ id, name, file: path.relative(outDir, tilePath).replaceAll("\\", "/") });
    try {
      if (id === 0 || id === 1 || id === 3) {
        const a00 = sampleWrap(imgA, 0, 0, textureScale);
        const b00 = sampleWrap(imgB, 0, 0, textureScale);
        const t00 = sampleWrap(imgT, 0, 0, textureScale);
        const aCC = sampleWrap(imgA, Math.floor(tileSize/2), Math.floor(tileSize/2), textureScale);
        const bCC = sampleWrap(imgB, Math.floor(tileSize/2), Math.floor(tileSize/2), textureScale);
        const tCC = sampleWrap(imgT, Math.floor(tileSize/2), Math.floor(tileSize/2), textureScale);
        const line = `${new Date().toISOString()} tile_${id}_${name} alphaSum=${alphaSum} A00=${a00.join(',')} B00=${b00.join(',')} T00=${t00.join(',')} ACC=${aCC.join(',')} BCC=${bCC.join(',')} TCC=${tCC.join(',')}\n`;
        await fs.appendFile(path.join(outDir, "debug.log"), line, "utf8");
      } else {
        const line = `${new Date().toISOString()} tile_${id}_${name} alphaSum=${alphaSum}\n`;
        await fs.appendFile(path.join(outDir, "debug.log"), line, "utf8");
      }
    } catch {}
  }

  // Stitch sheet 4×4
  const COLS = 4, ROWS = 4;
  // Preload and normalize all overlays to buffers of tileSize for a single composite call
  const prepared: sharp.OverlayOptions[] = [];
  tiles.sort((a, b) => a.id - b.id);
  for (let i = 0; i < tiles.length; i++) {
    const row = Math.floor(i / COLS), col = i % COLS;
    const fp = path.join(outDir, tiles[i].file);
    let buf: Buffer;
    try {
      const md = await sharp(fp).metadata();
      if ((md.width ?? tileSize) !== tileSize || (md.height ?? tileSize) !== tileSize) {
        buf = await sharp(fp).ensureAlpha().resize(tileSize, tileSize, { kernel: "nearest", fit: "fill" }).png().toBuffer();
      } else {
        buf = await sharp(fp).ensureAlpha().png().toBuffer();
      }
    } catch {
      buf = await sharp(fp).ensureAlpha().resize(tileSize, tileSize, { kernel: "nearest", fit: "fill" }).png().toBuffer();
    }
    prepared.push({ input: buf, left: col * tileSize, top: row * tileSize });
  }
  const sheetPath = path.join(outDir, `coast16_${tileSize}.png`);
  await sharp({ create: { width: COLS * tileSize, height: ROWS * tileSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(prepared)
    .png()
    .toFile(sheetPath);

  // Write a minimal Godot 4 TileSet .tres next to the sheet, same basename
try {
    const slug = path.basename(outDir);
    const sheetName = path.basename(sheetPath);
    const tresName = sheetName.replace(/\.png$/i, ".tres");
    const extId = "1_tex";
    const atlasId = "TileSetAtlasSource_main";

    // Header stays dynamic so it points to the sheet we just wrote.
    const header = [
      `[gd_resource type="TileSet" load_steps=3 format=3 uid="uid://auto_${slug}_coast16"]`,
      "",
      `[ext_resource type="Texture2D" path="res://Assets/Tilesets/TilesetRessources/${slug}/${sheetName}" id="${extId}"]`,
      "",
      `[sub_resource type="TileSetAtlasSource" id="${atlasId}"]`,
      `texture = ExtResource("${extId}")`,
      `texture_region_size = Vector2i(${tileSize}, ${tileSize})`,
    ];

    // Exact per-tile rules copied from the provided .tres (only the 4×4 we export).
    // NOTE: These coordinates and peering bits are verbatim from your resource.
    const rules = [
      // row 0
      `0:0/0 = 0`,
      `0:0/0/terrain_set = 0`,
      `0:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(-11.7415, -16, -16, -16, -16, -2.10296, 16, -1.40198, 16, -16)`,
      `0:0/0/terrains_peering_bit/bottom_right_corner = 0`,
      `0:0/0/terrains_peering_bit/bottom_side = 0`,
      `0:0/0/terrains_peering_bit/bottom_left_corner = 0`,

      `1:0/0 = 0`,
      `1:0/0/terrain_set = 0`,
      `1:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(-16, 2.45346, -16, -2.10296, -16, 14.7908, 14.3878, 16, 18.4009, 2.10296)`,
      `1:0/0/terrains_peering_bit/top_left_corner = 0`,
      `1:0/0/terrains_peering_bit/top_side = 0`,
      `1:0/0/terrains_peering_bit/top_right_corner = 0`,

      `2:0/0 = 0`,
      `2:0/0/terrain_set = 0`,
      `2:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(-11.7415, -16, -16, -16, -16, 16, -3.68019, 17.5247, -2.45346, -16)`,
      `2:0/0/terrains_peering_bit/right_side = 0`,
      `2:0/0/terrains_peering_bit/bottom_right_corner = 0`,
      `2:0/0/terrains_peering_bit/top_right_corner = 0`,

      `3:0/0 = 0`,
      `3:0/0/terrain_set = 0`,
      `3:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(9.46333, -14.5455, 0.525742, -16, 0.350494, 16, 16, 16, 16, -16)`,
      `3:0/0/terrains_peering_bit/bottom_left_corner = 0`,
      `3:0/0/terrains_peering_bit/left_side = 0`,
      `3:0/0/terrains_peering_bit/top_left_corner = 0`,

      // row 1
      `0:1/0 = 0`,
      `0:1/0/terrain_set = 0`,
      `0:1/0/physics_layer_0/polygon_0/points = PackedVector2Array(-11.7415, -16, -16, -16, -16, -2.10296, -0.700989, -1.22673, -0.525742, -16)`,
      `0:1/0/terrains_peering_bit/right_side = 0`,
      `0:1/0/terrains_peering_bit/bottom_right_corner = 0`,
      `0:1/0/terrains_peering_bit/bottom_side = 0`,
      `0:1/0/terrains_peering_bit/bottom_left_corner = 0`,
      `0:1/0/terrains_peering_bit/top_right_corner = 0`,

      `1:1/0 = 0`,
      `1:1/0/terrain_set = 0`,
      `1:1/0/physics_layer_0/polygon_0/points = PackedVector2Array(7.18512, -16, -0.175247, -16, 0.175247, 0.350494, 16, -1.40198, 16, -16)`,
      `1:1/0/terrains_peering_bit/bottom_right_corner = 0`,
      `1:1/0/terrains_peering_bit/bottom_side = 0`,
      `1:1/0/terrains_peering_bit/bottom_left_corner = 0`,
      `1:1/0/terrains_peering_bit/left_side = 0`,
      `1:1/0/terrains_peering_bit/top_left_corner = 0`,

      `2:1/0 = 0`,
      `2:1/0/terrain_set = 0`,
      `2:1/0/physics_layer_0/polygon_0/points = PackedVector2Array(7.18512, 0.876236, 0, -0.876236, -0.525742, 16, 16, 16, 16, -1.05148)`,
      `2:1/0/terrains_peering_bit/bottom_left_corner = 0`,
      `2:1/0/terrains_peering_bit/left_side = 0`,
      `2:1/0/terrains_peering_bit/top_left_corner = 0`,
      `2:1/0/terrains_peering_bit/top_side = 0`,
      `2:1/0/terrains_peering_bit/top_right_corner = 0`,

      `3:1/0 = 0`,
      `3:1/0/terrain_set = 0`,
      `3:1/0/physics_layer_0/polygon_0/points = PackedVector2Array(-11.5663, -2.10296, -16, -1.75247, -16, 16, 1.22673, 16, 1.40197, -1.92772)`,
      `3:1/0/terrains_peering_bit/right_side = 0`,
      `3:1/0/terrains_peering_bit/bottom_right_corner = 0`,
      `3:1/0/terrains_peering_bit/top_left_corner = 0`,
      `3:1/0/terrains_peering_bit/top_side = 0`,
      `3:1/0/terrains_peering_bit/top_right_corner = 0`,

      // row 2
      `0:2/0 = 0`,
      `0:2/0/terrain_set = 0`,
      `0:2/0/physics_layer_0/polygon_0/points = PackedVector2Array(-0.175247, -16, 16, -16, 16, 16, -17.1742, 16.999, -16, 0.350494, 1.92772, -0.350494)`,
      `0:2/0/terrains_peering_bit/top_left_corner = 0`,

      `1:2/0 = 0`,
      `1:2/0/terrain_set = 0`,
      `1:2/0/physics_layer_0/polygon_0/points = PackedVector2Array(-1.57722, -16, -1.05148, -0.175247, 16, 1.40197, 16, 16, -16, 16, -16, -16)`,
      `1:2/0/terrains_peering_bit/top_right_corner = 0`,

      `2:2/0 = 0`,
      `2:2/0/terrain_set = 0`,
      `2:2/0/physics_layer_0/polygon_0/points = PackedVector2Array(16, -1.22673, -0.350494, -0.525742, -0.700989, 16, -16, 16, -16, -14.7207, 16, -16)`,
      `2:2/0/terrains_peering_bit/bottom_right_corner = 0`,

      `3:2/0 = 0`,
      `3:2/0/terrain_set = 0`,
      `3:2/0/physics_layer_0/polygon_0/points = PackedVector2Array(-16, -3.68019, -16, -16, 16, -16, 16, 16, 2.80395, 16, 2.9792, -2.27821)`,
      `3:2/0/terrains_peering_bit/bottom_left_corner = 0`,

      // row 3
      `0:3/0 = 0`,
      `0:3/0/terrain_set = 0`,
      `0:3/0/physics_layer_0/polygon_0/points = PackedVector2Array(0, -1.05148, -16, -1.40198, -17.5247, -18.0504, -1.05148, -17.5247)`,
      `0:3/0/physics_layer_0/polygon_1/points = PackedVector2Array(0.700989, -1.22673, 17.5247, -0.876236, 16, 14.896, 0.350494, 16)`,
      `0:3/0/terrains_peering_bit/bottom_left_corner = 0`,
      `0:3/0/terrains_peering_bit/top_right_corner = 0`,

      `1:3/0 = 0`,
      `1:3/0/terrain_set = 0`,
      `1:3/0/physics_layer_0/polygon_0/points = PackedVector2Array(0, -0.175247, -0.350494, -16, -16, -16, -16, -0.350494)`,
      `1:3/0/physics_layer_0/polygon_1/points = PackedVector2Array(0.700989, 0.350494, 14.5455, 0.175247, 16.6485, 17.6999, 1.40197, 18.0504)`,
      `1:3/0/terrains_peering_bit/bottom_left_corner = 0`,
      `1:3/0/terrains_peering_bit/top_right_corner = 0`,

      `2:3/0 = 0`,
      `2:3/0/physics_layer_0/polygon_0/points = PackedVector2Array(16, -16, -16, -16, -16, 16, 16, 16)`,

      `3:3/0 = 0`,
      `3:3/0/terrain_set = 0`,
      `3:3/0/terrain = 0`,
      `3:3/0/terrains_peering_bit/right_side = 0`,
      `3:3/0/terrains_peering_bit/bottom_right_corner = 0`,
      `3:3/0/terrains_peering_bit/bottom_side = 0`,
      `3:3/0/terrains_peering_bit/bottom_left_corner = 0`,
      `3:3/0/terrains_peering_bit/left_side = 0`,
      `3:3/0/terrains_peering_bit/top_left_corner = 0`,
      `3:3/0/terrains_peering_bit/top_side = 0`,
      `3:3/0/terrains_peering_bit/top_right_corner = 0`,
    ];

    const footer = [
      "",
      "[resource]",
      `tile_size = Vector2i(${tileSize}, ${tileSize})`,
      `physics_layer_0/collision_layer = 1`,
      // Copied from your resource:
      `physics_layer_1/collision_layer = 2`,
      `physics_layer_1/collision_mask = 2`,
      `terrain_set_0/mode = 0`,
      `terrain_set_0/terrain_0/name = "Terrain 0"`,
      `terrain_set_0/terrain_0/color = Color(0.5, 0.34375, 0.25, 1)`,
      `sources/0 = SubResource("${atlasId}")`,
    ];

    const tres = [...header, ...rules, ...footer, ""].join("\n");
    await fs.writeFile(path.join(outDir, tresName), tres, "utf8");
  } catch {}

  // Manifest
  const palette: RGB[] = ROMAN_STEAMPUNK_32;
  const manifest: TilesetManifest = {
    schema: "tileset.manifest/1.0",
    material: "procedural",
    engine_order: "coast16",
    grid: { cols: COLS, rows: ROWS, tile: tileSize },
    palette: { name: paletteName, rgb: palette },
    openai: { model: "gpt-image-1", size: "1024x1024", transparent: true },
    tiles: tiles.map(t => ({ id: t.id, name: t.name, file: t.file, promptHash: undefined })),
    sheet: { file: path.basename(sheetPath), layout: "row-major" },
    // embed procedural block for tightness
  } as any;
  (manifest as any).procedural = {
    pattern: "coast16",
    settings: { tileSize, bandWidth, cornerStyle, transitionMode, textureScale },
    textures: { A: params.textures.A ?? null, B: params.textures.B ?? null, T: params.textures.T ?? null }
  };

  const manifestPath = path.join(outDir, `coast16_manifest.json`);
  await writeManifest(manifestPath, manifest);

  log.info({ sheetPath }, "coast16 procedural sheet written");
  return { sheetPath, tilePaths: tiles.map(t => path.join(outDir, t.file)), manifestPath };
}
