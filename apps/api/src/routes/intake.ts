import { Router, type Request, type Response } from "express";
import * as schemas from "@pixelart/schemas";
import { writeLiteDef, readLiteDef } from "@pixelart/config";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
import { createReadStream } from "node:fs";


// ───────────────────────────────── helpers ─────────────────────────────────

function assetRoot() {
  // mirrors the documented fallback
  return process.env.ASSET_ROOT || resolve(process.cwd(), "..", "..", "assets", "characters");
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ensureUniqueSlug(root: string, base: string): Promise<string> {
  const exists = async (dir: string) =>
    fs.access(dir).then(() => true).catch(() => false);

  if (!(await exists(join(root, base)))) return base;

  // try random 4-digit suffix a few times
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await exists(join(root, candidate)))) return candidate;
  }
  // last resort: timestamp
  return `${base}-${Date.now()}`;
}

// Ajv validator (support both named & default export shapes)
const validateCharacterLite =
  (schemas as any).validateCharacterLite ??
  (schemas as any).default?.validateCharacterLite;

// Small guard so we fail loudly if schemas weren’t wired
function assertValidator() {
  if (typeof validateCharacterLite !== "function") {
    throw new Error("Ajv validator validateCharacterLite not found from @pixelart/schemas");
  }
}

// ───────────────────────────────── router ─────────────────────────────────

export const intake: import("express").Router = Router();

/**
 * POST /validate-lite
 * Derive char_slug from char_name (if missing), then validate.
 * Does NOT write to disk.
 */
intake.post("/validate-lite", async (req: Request, res: Response) => {
  try {
    assertValidator();

    const def = req.body ?? {};
    const name: string | undefined = def?.identity?.char_name;
    const incomingSlug: string | undefined = def?.identity?.char_slug;

    const derived = incomingSlug || (name ? slugify(name) : undefined);
    if (!def.identity) def.identity = {};
    if (!def.identity.char_slug && derived) {
      def.identity.char_slug = derived;
    }

    const ok: boolean = validateCharacterLite(def);
    if (!ok) {
      return res
        .status(400)
        .json({ ok: false, code: "VALIDATION_ERROR", details: validateCharacterLite.errors });
    }

    return res.json({ ok: true, slug: def.identity.char_slug ?? null });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, code: "SERVER_ERROR", error: String(err?.message ?? err) });
  }
});

/**
 * POST /intake/commit
 * Derive a UNIQUE char_slug, validate, then write char_def_lite_<slug>.json
 * Returns { ok, slug, file }
 */
intake.post("/intake/commit", async (req: Request, res: Response) => {
  try {
    assertValidator();

    const def = req.body ?? {};
    const name: string | undefined = def?.identity?.char_name;
    if (!name) {
      return res
        .status(400)
        .json({ ok: false, code: "BAD_REQUEST", message: "identity.char_name is required" });
    }

    const root = assetRoot();
    const incomingSlug: string | undefined = def?.identity?.char_slug;
    const base = slugify(incomingSlug || name);
    const slug = await ensureUniqueSlug(root, base);

    // write the slug back BEFORE validation
    def.identity = { ...(def.identity ?? {}), char_slug: slug };

    const ok: boolean = validateCharacterLite(def);
    if (!ok) {
      return res
        .status(400)
        .json({ ok: false, code: "VALIDATION_ERROR", details: validateCharacterLite.errors });
    }

    // write using helper; if helper signature differs, fallback to manual fs write
    let filePath: string | undefined;
    try {
      // many projects implement writeLiteDef(slug, def) -> string path
      filePath = (await (writeLiteDef as any)(slug, def)) as string | undefined;
    } catch {
      // fallback: manual write
      const dir = join(root, slug);
      await fs.mkdir(dir, { recursive: true });
      filePath = join(dir, `char_def_lite_${slug}.json`);
      await fs.writeFile(filePath, JSON.stringify(def, null, 2), "utf8");
    }

    return res.json({ ok: true, slug, file: filePath });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, code: "SERVER_ERROR", error: String(err?.message ?? err) });
  }
});

intake.put("/characters/:slug/defs/lite", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug;
    const def = req.body ?? {};

    // Always enforce slug consistency
    def.identity = { ...(def.identity ?? {}), char_slug: slug };

    const ok: boolean = validateCharacterLite(def);
    if (!ok) {
      return res
        .status(400)
        .json({ ok: false, code: "VALIDATION_ERROR", details: validateCharacterLite.errors });
    }

    // write using helper (or fs fallback)
    const root = assetRoot();
    let filePath: string | undefined;
    try {
      filePath = (await (writeLiteDef as any)(slug, def)) as string | undefined;
    } catch {
      const dir = join(root, slug);
      await fs.mkdir(dir, { recursive: true });
      filePath = join(dir, `char_def_lite_${slug}.json`);
      await fs.writeFile(filePath, JSON.stringify(def, null, 2), "utf8");
    }

    return res.json({ ok: true, slug, file: filePath });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, code: "SERVER_ERROR", error: String(err?.message ?? err) });
  }
});

/**
 * GET /characters
 * Scan ASSET_ROOT for directories containing char_def_lite_<slug>.json
 * Returns { slugs: string[] }
 */
intake.get("/characters/:slug/files/:name", async (req: Request, res: Response) => {
  try {
    const { slug, name } = req.params;
    // very small whitelist to avoid path traversal
    if (!/^[a-z0-9._-]+$/i.test(name)) return res.status(400).end("Bad filename");
    const root = assetRoot();
    const filePath = join(root, slug, name);

    // allow only images/json (dev friendly)
    if (!/\.(png|webp|json)$/i.test(name)) return res.status(403).end("Forbidden");

    // existence check
    await fs.access(filePath).catch(() => {
      throw Object.assign(new Error("Not found"), { status: 404 });
    });

    // stream
    res.sendFile(filePath);
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ ok: false, error: String(err?.message ?? err) });
  }
});

/**
 * GET /characters/:slug/defs/lite
 * Return stored JSON for a slug.
 */
intake.get("/characters/:slug/defs/lite", async (req: Request, res: Response) => {
  try {
    const json = await readLiteDef(req.params.slug);
    return res.json(json);
  } catch (e: any) {
    return res.status(404).json({ ok: false, error: e?.message ?? "Not found" });
  }
});
