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
  const json = await res.json();
  // DEBUG
  console.debug("[jobs] get", { id, state: json?.state, url });
  return json as { id: string; state: string; progress?: number; returnvalue?: unknown };
}

export function fileUrl(slug: string, name: string, bust?: number | string) {
  const url = `${API}/characters/${encodeURIComponent(slug)}/files/${encodeURIComponent(name)}${
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

export async function listAssets(slug: string) {
  const url = `${API}/characters/${encodeURIComponent(slug)}/assets?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  // DEBUG
  console.debug("[assets] list", { slug, count: json?.files?.length, url });
  return json as { ok: boolean; files: string[] };
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