// apps/api/src/routes/ulpc.ts
import { Router, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveUlpcSheetDefs } from "@pixelart/config";

const ulpcRouter: Router = Router();

type SheetItem = {
  id: string;
  name: string;
  typeName: string | null;
  category: string;
  layerPaths: Record<string, string>;
  variants: string[];
};

type Catalog = {
  ok: true;
  loadedAt: number;
  categories: Array<{ category: string; items: SheetItem[] }>;
};

let cachedCatalog: Catalog | null = null;

async function loadCatalog(): Promise<Catalog> {
  if (cachedCatalog) return cachedCatalog;

  const defsDir = resolveUlpcSheetDefs();
  const entries = await fs.readdir(defsDir, { withFileTypes: true });

  const byCategory = new Map<string, SheetItem[]>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(defsDir, entry.name);
    let json: any;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      json = JSON.parse(raw);
    } catch {
      continue;
    }

    const layer1 = json?.layer_1;
    if (!layer1 || typeof layer1 !== "object") continue;

    const layerPaths: Record<string, string> = {};
    let topCategory: string | null = null;

    for (const [key, value] of Object.entries(layer1)) {
      if (typeof key === "string" && key.toLowerCase() === "zpos") continue;
      if (!value || typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      const normalized = trimmed.replace(/^\/+|\/+$/g, ""); // remove leading/trailing slashes
      if (!normalized) continue;
      const segments = normalized.split("/").filter(Boolean);
      if (!segments.length) continue;

      layerPaths[key] = normalized;

      if (!topCategory) topCategory = segments[0];
    }

    if (!topCategory || Object.keys(layerPaths).length === 0) continue;

    const slug = entry.name.replace(/\.json$/i, "");
    const item: SheetItem = {
      id: slug,
      name: typeof json?.name === "string" && json.name.trim() ? json.name.trim() : slug,
      typeName: typeof json?.type_name === "string" ? json.type_name : null,
      category: topCategory,
      layerPaths,
      variants: Array.isArray(json?.variants) ? json.variants.filter((v: unknown) => typeof v === "string") : [],
    };

    if (!byCategory.has(topCategory)) {
      byCategory.set(topCategory, []);
    }
    byCategory.get(topCategory)!.push(item);
  }

  const categories = Array.from(byCategory.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  cachedCatalog = {
    ok: true,
    loadedAt: Date.now(),
    categories,
  };

  return cachedCatalog;
}

ulpcRouter.get("/ulpc/sheet-defs", async (_req: Request, res: Response) => {
  try {
    const catalog = await loadCatalog();
    res.json(catalog);
  } catch (err: any) {
    console.error("[ulpc.sheet-defs] error", err);
    res.status(500).json({ ok: false, code: "ULPC_DEFS_ERROR", message: err?.message ?? "sheet_def_load_failed" });
  }
});

export { ulpcRouter };
