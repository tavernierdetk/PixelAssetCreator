//Users/alexandredube-cote/entropy/pixelart-backbone/apps/api/src/routes/assets.ts
import { Router, type Request, type Response, type Express } from "express";
import { promises as fs } from "node:fs";
import { resolve, join, extname } from "node:path";
import multer from "multer";
import { readIntermediary, readUlpcBuild } from "@pixelart/config";

export const assets: import("express").Router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function assetRoot() {
  return process.env.ASSET_ROOT || resolve(process.cwd(), "..", "..", "assets", "characters");
}
function charDir(slug: string) {
  return join(assetRoot(), slug);
}
function expectedFileForSlot(slug: string, slot: "portrait" | "idle", ext = ".png") {
  if (slot === "portrait") return `high_res_portrait_${slug}${ext}`;
  if (slot === "idle") return `idle_static_${slug}${ext}`;
  throw new Error("invalid slot");
}
async function listFilesRecursive(root: string, base = ""): Promise<string[]> {
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = join(root, entry.name);
    if (entry.isDirectory()) {
      const children = await listFilesRecursive(abs, rel);
      out.push(...children);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

async function listFiles(slug: string) {
  const dir = charDir(slug);
  return listFilesRecursive(dir);
}

// GET (keep if you already have it)
assets.get("/characters/:slug/assets", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const files = await listFiles(slug);
    let intermediary: any = null;
    let ulpc: any = null;
    try {
      intermediary = await readIntermediary(slug);
    } catch {
      intermediary = null;
    }
    try {
      ulpc = await readUlpcBuild(slug);
    } catch {
      ulpc = null;
    }

    res.json({ ok: true, files, intermediary, ulpc });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// DELETE
assets.delete("/characters/:slug/assets", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params as { slug: string };
    const slot = (req.query.slot as "portrait" | "idle") || "portrait";
    const dir = charDir(slug);

    const names = await fs.readdir(dir).catch(() => []);
    const target =
      slot === "portrait"
        ? names.find((n) => /^high_res_portrait_/i.test(n))
        : names.find((n) => /^(idle_static_|idle_pixelated_)/i.test(n));

    if (!target) return res.json({ ok: true, deleted: null });

    await fs.unlink(join(dir, target));
    return res.json({ ok: true, deleted: target });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// UPLOAD (multipart)
assets.post(
  "/characters/:slug/upload",
  upload.single("file"),
  async (req: Request & { file?: Express.Multer.File }, res: Response) => {
    try {
      const { slug } = req.params as { slug: string };
      const slot = (req.query.slot as "portrait" | "idle") || "portrait";

      if (!req.file) return res.status(400).json({ ok: false, code: "NO_FILE" });

      const dir = charDir(slug);
      await fs.mkdir(dir, { recursive: true });

      const ext = (extname(req.file.originalname) || ".png").toLowerCase();
      const safeExt = [".png", ".webp", ".jpg", ".jpeg"].includes(ext) ? ext : ".png";

      const filename = expectedFileForSlot(slug, slot, safeExt);
      const abs = join(dir, filename);

      await fs.writeFile(abs, req.file.buffer);
      return res.json({ ok: true, file: filename });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  }
);
