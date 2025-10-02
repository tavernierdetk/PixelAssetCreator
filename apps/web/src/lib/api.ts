//Users/alexandredube-cote/entropy/pixelart-backbone/apps/web/src/lib/api.ts
import type { CharacterDefinitionLite, JobInfo } from "@/types";


export const API = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export async function assistantTurn(input: {
  message: string;
  draft?: any;
  slug?: string;
  thread?: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const r = await fetch(`${API}/assistant/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`assistantTurn ${r.status}: ${text}`);
  }
  return r.json();
}

export async function updateLiteDef(slug: string, def: any) {
  const res = await fetch(`${API}/characters/${encodeURIComponent(slug)}/defs/lite`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error(`updateLiteDef ${slug}: ${res.status}`);
  return res.json();
}

export async function listCharacters(): Promise<{ ok: boolean; slugs: string[] }> {
  const res = await fetch(`${API}/characters`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listCharacters ${res.status}`);
  return res.json();
}

export async function deleteCharacter(slug: string): Promise<{ ok: boolean; slug: string }> {
  const res = await fetch(`${API}/characters/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`deleteCharacter ${slug}: ${res.status}`);
  return res.json();
}

export type ComposeWarning = {
  category: string;
  variant: string;
  reason: string;
  detail?: string;
  animation?: string;
};

export type UlpcSheetItem = {
  id: string;
  name: string;
  typeName: string | null;
  category: string;
  layerPaths: Record<string, string>;
  variants: string[];
  animations?: string[];
};

export type UlpcSheetCatalog = {
  ok: boolean;
  loadedAt: number;
  categories: Array<{ category: string; items: UlpcSheetItem[] }>;
};

export async function getUlpcSheetDefs(): Promise<UlpcSheetCatalog> {
  const res = await fetch(`${API}/ulpc/sheet-defs`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getUlpcSheetDefs ${res.status}`);
  return res.json();
}

export async function enqueuePortrait(slug: string): Promise<{ jobId: string }> {
  const res = await fetch(`${API}/pipeline/${encodeURIComponent(slug)}/portrait`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`enqueuePortrait ${slug}: ${res.status}`);
  return res.json();
}

export async function getJob(id: string) {
  const url = `${API}/jobs/${encodeURIComponent(id)}?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // Treat not found as transient/removed job
    console.debug("[jobs] get not_found", { id, url });
    return { id, state: "not_found" } as any;
  }
  const json = await res.json();
  console.debug("[jobs] get", { id, state: json?.state, url });
  return json as { id: string; state: string; progress?: number; returnvalue?: unknown; failedReason?: string };
}

export function fileUrl(slug: string, name: string, bust?: number | string) {
  const encodePath = (value: string) =>
    value
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  const rel = encodePath(name);
  const url = `${API}/characters/${encodeURIComponent(slug)}/files/${rel}${
    bust ? `?v=${bust}` : ""
  }`;
  // DEBUG (log only the first time per call site to avoid spam if needed)
  console.debug("[assets] fileUrl", { slug, name, url });
  return url;
}

async function json<T>(r: Response): Promise<T> {
if (!r.ok) throw new Error(await r.text());
return r.json();
}


export async function validateLite(def: CharacterDefinitionLite): Promise<{ ok: boolean; errors?: any }>{
const r = await fetch(`${API}/validate-lite`, {
method: "POST",
headers: { "content-type": "application/json" },
body: JSON.stringify(def),
});
return json(r);
}


export async function commitLite(def: CharacterDefinitionLite): Promise<{ ok: boolean; slug: string; file: string }>{
const r = await fetch(`${API}/intake/commit`, {
method: "POST",
headers: { "content-type": "application/json" },
body: JSON.stringify(def),
});
return json(r);
}



export async function getLiteDef(slug: string) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE ?? "http://localhost:4000"}/characters/${slug}/defs/lite`);
  if (!res.ok) throw new Error(`getLiteDef ${slug}: ${res.status}`);
  return res.json();
}

export async function listAssets(slug: string): Promise<{
  ok: boolean;
  files: string[];
  intermediary: any | null;
  ulpc: any | null;
}> {
  const url = `${API}/characters/${encodeURIComponent(slug)}/assets?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  // DEBUG
  console.debug("[assets] list", { slug, count: json?.files?.length, url });
  return {
    ok: Boolean(json?.ok),
    files: Array.isArray(json?.files) ? json.files : [],
    intermediary: json?.intermediary ?? null,
    ulpc: json?.ulpc ?? null,
  };
}

export async function getProjectSettings() {
  const r = await fetch(`${API}/project/settings`);
  if (!r.ok) throw new Error(`getProjectSettings ${r.status}`);
  return r.json() as Promise<{ ok: true; settings: any }>;
}

export async function updateProjectSettings(settings: any) {
  const r = await fetch(`${API}/project/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!r.ok) throw new Error(`updateProjectSettings ${r.status}`);
  return r.json() as Promise<{ ok: true }>;
}

export async function uploadAsset(slug: string, slot: "portrait" | "idle", file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API}/characters/${slug}/upload?slot=${slot}`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) throw new Error(`uploadAsset ${r.status}`);
  return r.json() as Promise<{ ok: true; file: string }>;
}

export async function deleteAsset(slug: string, slot: "portrait" | "idle") {
  const r = await fetch(`${API}/characters/${slug}/assets?slot=${slot}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`deleteAsset ${r.status}`);
  return r.json() as Promise<{ ok: true; deleted: string | null }>;
}

export async function enqueueIdle(slug: string) {
  const r = await fetch(`${API}/pipeline/${slug}/idle`, { method: "POST" });
  if (r.status === 404 || r.status === 501) {
    throw new Error("Idle pipeline not implemented on server");
  }

  if (!r.ok) throw new Error(`enqueueIdle ${r.status}`);
  return r.json() as Promise<{ jobId: string }>;
}

export async function enqueueULPC(slug: string, build?: unknown) {
  const res = await fetch(`${API}/pipeline/${encodeURIComponent(slug)}/ulpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(build ? { build } : {})
  });
  if (!res.ok) throw new Error(`enqueueULPC failed: ${res.status}`);
  return res.json() as Promise<{ ok: boolean; jobId: string }>;
}

export async function assistantGenerateIntermediary(
  slug: string,
  draft?: CharacterDefinitionLite
): Promise<{ ok: boolean; data: any }> {
  const resp = await fetch(`${API}/assistant/char-intermediary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // The intermediary assistant requires a message; use a deterministic default.
      message:
        `Generate an IntermediarySelection.v2 for character "${slug || draft?.identity?.char_name || "unknown"}" ` +
        `from the provided CharacterDefinitionLite. Return ONLY the JSON object.`,
      baseDraft: draft ?? null,
      slug,
      thread: [], // optional
    }),
  });
  if (!resp.ok) throw new Error(`assistant/char-intermediary failed: ${resp.status}`);
  return resp.json();
}

export async function convertIntermediary(payload: {
  slug: string;
  intermediary: any;
  animations?: string[];
  compose?: boolean;
  outPath?: string;
}): Promise<any> {
  const resp = await fetch(`${API}/assistant/convert-intermediary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`convert-intermediary failed: ${resp.status}`);
  return resp.json();
}

export async function exportGodot(
  slug: string,
  payload: {
    name: string;
    classTag: string;
    numericId: number;
    stats: {
      creature_affinity: number;
      chaos_mastery: number;
      kinesthetic: number;
      lucidity: number;
      terrain_control: number;
    };
    defaultFpsBattle: number;
    defaultFpsOverworld: number;
    writeBattleVisual?: boolean;
  }
): Promise<{ ok: true }> {
  const res = await fetch(`${API}/characters/${encodeURIComponent(slug)}/export-godot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ───────────── Tileset API (mirrors character assets) ─────────────
export async function listTilesets(): Promise<{ ok: boolean; slugs: string[] }> {
  const r = await fetch(`${API}/tilesets`, { cache: "no-store" });
  if (!r.ok) throw new Error(`listTilesets ${r.status}`);
  return r.json();
}

export async function deleteTileset(slug: string): Promise<{ ok: boolean; deleted: string }> {
  const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`deleteTileset ${slug}: ${r.status}`);
  return r.json();
}

export async function listTilesetAssets(slug: string): Promise<{ ok: boolean; files: string[] }> {
  const url = `${API}/tilesets/${encodeURIComponent(slug)}/assets?t=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    console.error("[tileset] assets_list_failed", { slug, status: r.status, url });
    throw new Error(`listTilesetAssets ${slug}: ${r.status}`);
  }
  const json = await r.json();
  console.debug("[tileset] assets_list", { slug, count: Array.isArray(json?.files) ? json.files.length : 0, url });
  return json;
}

export function tilesetFileUrl(slug: string, rel: string, bust?: number | string) {
  const enc = rel.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${API}/tilesets/${encodeURIComponent(slug)}/files/${enc}${bust ? `?v=${bust}` : ""}`;
}



export async function getPatterns() {
const r = await fetch(`${API}/tileset-patterns`);
if (!r.ok) throw new Error("patterns_fetch_failed");
const j = await r.json();
return j.patterns as Array<{ id: string; displayName: string; tileSize: number; grid: { cols: number; rows: number }; slots: number; docs?: string }>
}


export async function getTilesetMeta(slug: string) {
  const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/meta`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.meta as {
    schema: string;
    slug: string;
    pattern: string;
    tile_size: number;
    palette?: string;
    created_at: string;
    // v2 fields
    materials_text?: string;
    palette_text?: string;
    interface_text?: string;
    materials_ab?: { A: { name: string; vehicles?: string[] }; B: { name: string; vehicles?: string[] } };
  } | null;
}


export async function enqueueTileset(args: { slug: string; pattern: string; material?: string; mode?: "direct"|"mask"; paletteName?: string }) {
const { slug, ...body } = args;
const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/enqueue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
if (!r.ok) throw new Error(`enqueue_failed_${r.status}`);
return r.json();
}

export async function generateTile(args: { slug: string; pattern: string; key: string; prompt: string; size?: string; tileName?: string; fullPrompt?: string }) {
  const { slug } = args;
  const url = `${API}/tilesets/${encodeURIComponent(slug)}/tile/${encodeURIComponent(args.key)}`;
  const body: any = {
    pattern: args.pattern,
    prompt: args.prompt,
    // Only include `size` if caller specifies; else the server uses project defaults
    ...(args.size ? { size: args.size } : {}),
    // Ensure server gets tileName for slot-specific instructions
    ...(args.tileName ? { tileName: args.tileName } : {}),
    // If provided, server should use this exact prompt as-is
    ...(args.fullPrompt ? { fullPrompt: args.fullPrompt } : {}),
  };
  console.debug("[tileset] generateTile →", { url, key: args.key, pattern: args.pattern, hasPrompt: !!args.prompt, hasFullPrompt: !!args.fullPrompt, tileName: args.tileName });
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let text = await r.text().catch(() => "");
    try {
      const errJson = JSON.parse(text);
      if (errJson && typeof errJson.error === "string") text = errJson.error;
    } catch {}
    console.error("[tileset] generateTile failed", { status: r.status, text, url });
    throw new Error(`[${r.status}] ${text || 'tile_generate_failed'}`);
  }
  const json = await r.json();
  console.debug("[tileset] generateTile ←", { ok: json?.ok, url: json?.url, sheetUrl: json?.sheetUrl });
  return json;
}


export async function stitchTileset(args: { slug: string; pattern: string }) {
const { slug, ...body } = args;
const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/stitch`, {
method: "POST",
headers: { "content-type": "application/json" },
body: JSON.stringify(body)
});
if (!r.ok) throw new Error(`stitch_failed_${r.status}`);
return r.json();
}


export async function cropTile(args: { slug: string; pattern: string; key: string; x: number; y: number; w: number; h: number }) {
const { slug, ...body } = args;
const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/crop`, {
method: "POST",
headers: { "content-type": "application/json" },
body: JSON.stringify(body)
});
if (!r.ok) throw new Error(`crop_failed_${r.status}`);
return r.json();
}

export async function updateTilesetMeta(slug: string, meta: { pattern?: string; materials_text?: string; palette_text?: string; interface_text?: string; materials_ab?: { A: { name: string; vehicles?: string[] }; B: { name: string; vehicles?: string[] } } }) {
  const url = `${API}/tilesets/${encodeURIComponent(slug)}/meta`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`updateTilesetMeta ${r.status}: ${text}`);
  }
  return r.json() as Promise<{ ok: true; meta: any }>;
}

export async function exportTilesetGodot(slug: string, opts?: { debug?: boolean }) {
  const params = opts?.debug ? `?debug=1` : "";
  const url = `${API}/tilesets/${encodeURIComponent(slug)}/export-godot${params}`;
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`exportTilesetGodot ${r.status}: ${text}`);
  }
  return r.json() as Promise<{ ok: boolean; localDir: string; projectDir?: string | null; atlas: string; tres: string; rulesSource: string }>;
}

// ───────────── Tileset Textures API ─────────────
export async function uploadTilesetTexture(slug: string, slot: "A"|"B"|"transition", file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/textures/upload?slot=${encodeURIComponent(slot)}`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) throw new Error(`uploadTilesetTexture ${r.status}`);
  return r.json() as Promise<{ ok: boolean; file: string }>;
}

export async function deleteTilesetTexture(slug: string, slot: "A"|"B"|"transition") {
  const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/textures?slot=${encodeURIComponent(slot)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`deleteTilesetTexture ${r.status}`);
  return r.json() as Promise<{ ok: boolean; deleted: string }>;
}

export async function generateTilesetTexture(slug: string, slot: "A"|"B"|"transition") {
  const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/textures/generate?slot=${encodeURIComponent(slot)}`, { method: "POST" });
  if (!r.ok) throw new Error(`generateTilesetTexture ${r.status}`);
  return r.json() as Promise<{ ok: boolean; file: string }>;
}

export async function generateProceduralTileset(slug: string, settings: { tileSize?: number; bandWidth?: number; cornerStyle?: "stepped"|"quarter"|"square"; transitionMode?: "texture"; textureScale?: number; lineStyle?: "straight_line"|"wavy_smooth"|"craggy"|"zigzag" }) {
  const r = await fetch(`${API}/tilesets/${encodeURIComponent(slug)}/procedural/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings || {}),
  });
  if (!r.ok) throw new Error(`procedural_generate ${r.status}`);
  return r.json() as Promise<{ ok: boolean; jobId: string }>;
}

// ───────────── Scene Assets API ─────────────
export async function generateSceneAsset(args: { name?: string; category?: string; description: string; size?: string }) {
  const r = await fetch(`${API}/scene-assets/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`scene_generate_failed_${r.status}`);
  return r.json() as Promise<{ ok: boolean; file: string; url: string }>;
}

export async function listSceneAssets(category?: string) {
  const url = `${API}/scene-assets/list${category ? `?category=${encodeURIComponent(category)}` : ""}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`scene_list_failed_${r.status}`);
  return r.json() as Promise<{ ok: boolean; files: string[] }>;
}

export function sceneAssetUrl(rel: string, bust?: number | string) {
  const enc = rel.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${API}/scene-assets/files/${enc}${bust ? `?v=${bust}` : ""}`;
}
