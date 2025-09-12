// packages/sprite-compose/src/ulpc.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createLogger } from "@pixelart/log";
const log = createLogger("@compose/ulpc");
function mustEnv(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`${name} is not set`);
    return v;
}
function getSheetDefsDir() {
    return mustEnv("ULPC_SHEET_DEFS");
}
function ulpcRoot() {
    return path.dirname(getSheetDefsDir());
}
function exists(p) {
    try {
        fs.accessSync(p);
        return true;
    }
    catch {
        return false;
    }
}
function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
    catch {
        return null;
    }
}
function walkPng(root, maxDepth = 5) {
    const out = [];
    function go(dir, depth) {
        if (depth > maxDepth)
            return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory())
                go(p, depth + 1);
            else if (e.isFile() && /\.(png|webp)$/i.test(e.name))
                out.push(p);
        }
    }
    go(root, 0);
    return out;
}
function toAbs(fromFile, relOrAbs) {
    if (path.isAbsolute(relOrAbs))
        return relOrAbs;
    const candidate = path.resolve(path.dirname(fromFile), relOrAbs);
    if (exists(candidate))
        return candidate;
    const fromRoot = path.resolve(ulpcRoot(), relOrAbs);
    return fromRoot;
}
function pngFromVariantJson(jsonPath, obj) {
    const fields = [
        obj?.file,
        Array.isArray(obj?.files) ? obj.files[0] : undefined,
        obj?.png,
        obj?.path,
        obj?.image,
        obj?.images?.sheet,
    ].filter(Boolean);
    for (const rel of fields) {
        const abs = toAbs(jsonPath, rel);
        if (exists(abs) && /\.(png|webp)$/i.test(abs))
            return abs;
    }
    return null;
}
async function resolveLayerPng(category, variant) {
    const defsDir = getSheetDefsDir();
    const catDir = path.join(defsDir, category);
    const directJson = path.join(catDir, `${variant}.json`);
    const indexJson = path.join(catDir, "index.json");
    // 1) <category>/<variant>.json
    if (exists(directJson)) {
        const def = readJson(directJson);
        const png = def && pngFromVariantJson(directJson, def);
        if (png && exists(png))
            return png;
    }
    // 2) <category>/index.json variants[]
    if (exists(indexJson)) {
        const idx = readJson(indexJson);
        const vs = Array.isArray(idx?.variants) ? idx.variants : [];
        const hit = vs.find((v) => v?.id === variant ||
            v?.name === variant ||
            v?.file === `${variant}.png` ||
            v?.file === variant);
        if (hit) {
            const png = pngFromVariantJson(indexJson, hit);
            if (png && exists(png))
                return png;
            const ref = hit.json ?? hit.def ?? hit.variant;
            if (ref) {
                const refAbs = toAbs(indexJson, ref);
                if (exists(refAbs)) {
                    const sub = readJson(refAbs);
                    const p2 = pngFromVariantJson(refAbs, sub);
                    if (p2 && exists(p2))
                        return p2;
                }
            }
        }
    }
    // 3) Fallback scan under repo root
    const pngs = walkPng(ulpcRoot(), 4);
    const norm = (s) => s.replace(/\\/g, "/").toLowerCase();
    const needleCat = `/${category.toLowerCase()}/`;
    const vTok = variant.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const candidates = pngs
        .map(norm)
        .filter(p => p.includes(needleCat) && (p.includes(vTok) || p.includes(`/${variant.toLowerCase()}`)));
    if (candidates.length) {
        const best = candidates.sort((a, b) => a.length - b.length)[0];
        return best;
    }
    throw new Error(`Unable to resolve PNG for ${category}/${variant}`);
}
async function applyTintIfAny(img, layer) {
    const hex = layer.color?.tint?.rgb;
    const mode = layer.color?.tint?.mode ?? "multiply";
    if (!hex || mode !== "multiply")
        return img;
    return img.tint(hex);
}
export async function composeULPC(build, outPath) {
    if (build.schema !== "ulpc.build/1.0") {
        throw new Error(`Unsupported schema: ${build?.schema}`);
    }
    const visible = (build.layers ?? []).filter(l => l.visible !== false);
    if (!visible.length)
        throw new Error("No visible layers to compose");
    log.info({ msg: "compose.start", defsDir: getSheetDefsDir(), layers: visible.length });
    // Resolve all layer PNGs
    const resolved = [];
    for (const l of visible) {
        const png = await resolveLayerPng(l.category, l.variant);
        resolved.push({ layer: l, png });
        log.info({ msg: "layer.resolved", category: l.category, variant: l.variant, png });
    }
    // Canvas size from first layer
    const baseMeta = await sharp(resolved[0].png).metadata();
    const W = baseMeta.width ?? 0;
    const H = baseMeta.height ?? 0;
    if (!W || !H)
        throw new Error("Cannot infer sheet size from first layer");
    // Order overlays
    const overlays = [];
    const sorted = resolved
        .map((r, i) => ({ ...r, z: r.layer.z_override ?? i, idx: i }))
        .sort((a, b) => (a.z - b.z) || (a.idx - b.idx));
    for (const r of sorted) {
        const left = r.layer.offset?.x ?? 0;
        const top = r.layer.offset?.y ?? 0;
        let img = sharp(r.png).ensureAlpha();
        img = await applyTintIfAny(img, r.layer);
        overlays.push({ input: await img.toBuffer(), left, top });
    }
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    await sharp({
        create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite(overlays).png().toFile(outPath);
    const stat = await fsp.stat(outPath);
    const bytes = stat.size;
    log.info({ msg: "compose.done", outPath, bytes, width: W, height: H, layers: overlays.length });
    return { outPath, bytes, layers: overlays.length, width: W, height: H };
}
