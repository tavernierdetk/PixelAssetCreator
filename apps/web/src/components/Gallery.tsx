import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { getLiteDef, listAssets } from "@/lib/api";

type GalleryItem = {
  slug: string;
  name: string;
  blurb: string;
  hasPortrait: boolean;
};

const LS_KEY = "pa_chars"; // fallback store of known slugs (added by creator on commit)

async function fetchBackendSlugs(): Promise<string[]> {
  // Optional future backend route: GET /characters -> { slugs: string[] }
  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE ?? "http://localhost:4000"}/characters`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { slugs?: string[] };
    return data.slugs ?? [];
  } catch {
    return [];
  }
}

function loadLocalSlugs(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function hydrate(slugs: string[]): Promise<GalleryItem[]> {
  const items = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const [def, assets] = await Promise.all([getLiteDef(slug), listAssets(slug)]);
        const name = def?.identity?.char_name ?? slug;
        const traitsStr = Array.isArray(def?.personality?.traits)
          ? def.personality.traits.join(", ")
          : "";
        const blurb =
          traitsStr ||
          [def?.personality?.desire, def?.personality?.fear].filter(Boolean).join(" / ") ||
          "No description yet.";
        const hasPortrait = (assets?.files ?? []).some((f: string) => f.includes("high_res_portrait"));
        return { slug, name, blurb, hasPortrait };
      } catch {
        return { slug, name: slug, blurb: "Unavailable", hasPortrait: false };
      }
    })
  );
  // de-dupe by slug
  const seen = new Set<string>();
  return items.filter((it) => (seen.has(it.slug) ? false : (seen.add(it.slug), true)));
}

export default function CharacterGallery() {
  const [localSlugs, setLocalSlugs] = useState<string[]>([]);
  const nav = useNavigate();

  useEffect(() => setLocalSlugs(loadLocalSlugs()), []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["gallery", localSlugs],
    queryFn: async () => {
      const backendSlugs = await fetchBackendSlugs();
      const merged = Array.from(new Set([...backendSlugs, ...localSlugs]));
      return hydrate(merged);
    },
  });

  const items = useMemo(() => data ?? [], [data]);

  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-600">
          {isLoading ? "Loading…" : `${items.length} character${items.length === 1 ? "" : "s"}`}
          {isFetching && " (refreshing…)"}
        </p>
        <button className="text-xs underline" onClick={() => refetch()}>Refresh</button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No characters yet — create one below.</p>
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li
              key={it.slug}
              className="flex items-center justify-between gap-3 py-3 cursor-pointer hover:bg-slate-50 px-2 rounded-lg"
              onClick={() => nav(`/characters/${it.slug}`)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center text-xs font-medium border ${
                    it.hasPortrait ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
                  }`}
                  title={it.hasPortrait ? "Portrait available" : "No portrait yet"}
                >
                  {it.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium leading-tight truncate">{it.name}</div>
                  <div className="text-xs text-slate-600 truncate">{it.blurb}</div>
                </div>
              </div>
              <div className="text-slate-400 text-xl leading-none select-none" aria-hidden>›</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
