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
  animations?: string[];
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
  const files = await walkJson(defsDir);

  const byCategory = new Map<string, SheetItem[]>();

  for (const filePath of files) {
    const slug = path.relative(defsDir, filePath).replace(/\\/g, "/").replace(/\.json$/i, "");
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
    const typeName = typeof json?.type_name === "string" && json.type_name.trim()
      ? json.type_name.trim()
      : null;
    let topCategory: string | null = typeName;

    for (const [key, value] of Object.entries(layer1)) {
      if (typeof key === "string" && key.toLowerCase() === "zpos") continue;
      if (!value || typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      const normalized = trimmed.replace(/^\/+|\/+$/g, "");
      if (!normalized) continue;
      const materialized = materializeLayerPath(normalized, key, json);
      const segments = materialized.split("/").filter(Boolean);
      if (!segments.length) continue;

      layerPaths[key] = materialized;

      if (!topCategory) topCategory = typeName ?? segments[0];
    }

    if (!topCategory || Object.keys(layerPaths).length === 0) continue;
    const item: SheetItem = {
      id: slug,
      name: typeof json?.name === "string" && json.name.trim() ? json.name.trim() : slug,
      typeName: typeof json?.type_name === "string" ? json.type_name : null,
      category: topCategory,
      layerPaths,
      variants: Array.isArray(json?.variants) ? json.variants.filter((v: unknown) => typeof v === "string") : [],
      animations: Array.isArray(json?.animations)
        ? json.animations.filter((anim: unknown) => typeof anim === "string" && anim.trim().length > 0)
        : undefined,
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

async function walkJson(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkJson(filePath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(filePath);
    }
  }
  return out;
}

const HEAD_LEXEME_BY_BODY: Record<string, string> = {
  male: "male",
  muscular: "male",
  female: "female",
  pregnant: "female",
  teen: "male",
  child: "child",
};

function materializeLayerPath(raw: string, bodyKey: string, _json: any): string {
  let out = raw;
  if (out.includes("${head}")) {
    const lexeme = HEAD_LEXEME_BY_BODY[bodyKey] ?? HEAD_LEXEME_BY_BODY.male;
    out = out.replace(/\$\{head\}/g, lexeme);
  }
  if (out.includes("${expression}")) {
    out = out.replace(/\/?\$\{expression\}/g, "");
  }
  out = out.replace(/\/{2,}/g, "/");
  if (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

export { ulpcRouter };
