import { Router, type Request, type Response } from "express";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { ASSET_ROOT, readLiteDef, readProjectSettings } from "@pixelart/config";
import {
  generateCreature,
  generateOverworldVisual,
  generateBattleVisual,
  writeOverworldAnimMeta,
  type CreatureInputs
} from "@pixelart/godot-res";

export const godotRouter: import("express").Router = Router();

function assertStringEnv(name: string, val: unknown): string | null {
  if (typeof val === "string" && val.trim().length > 0) return val;
  return null;
}

async function discoverGodotProjectRoot(): Promise<string> {
  // 1) explicit env
  const env = assertStringEnv("GODOT_PROJECT_ROOT", process.env.GODOT_PROJECT_ROOT);
  if (env) return env;

  // 2) project settings JSON
  const settings = await readProjectSettings().catch(() => ({}));
  const fromSettings = (settings as any)?.godot_project_root;
  if (typeof fromSettings === "string" && fromSettings.trim().length > 0) return fromSettings;

  throw new Error("GODOT_PROJECT_ROOT missing. Set env GODOT_PROJECT_ROOT or project.settings.json key godot_project_root.");
}

/**
 * POST /api/characters/:slug/export-godot
 * Body: {
 *   name: string;
 *   classTag: string;
 *   numericId: number;
 *   stats: { creature_affinity, chaos_mastery, kinesthetic, lucidity, terrain_control };
 *   defaultFpsBattle: number;
 *   defaultFpsOverworld: number;
 *   writeBattleVisual?: boolean;   // optional, default false
 * }
 */
godotRouter.post("/api/characters/:slug/export-godot", async (req: Request, res: Response) => {
  try {
    const slug: string = req.params.slug;
    if (!slug || !/^[a-z0-9._-]+$/i.test(slug)) {
      return res.status(400).json({ ok: false, message: "Bad slug" });
    }

    // Where ULPC exporter places artifacts for this slug
    const charDir = join(ASSET_ROOT, slug);
    // Common manifest filename used by our ULPC export
    const manifestPath = join(charDir, `${slug}_sprite_manifest.json`);
    await fs.access(manifestPath).catch(() => {
      throw Object.assign(new Error(`ULPC manifest not found for ${slug}: ${manifestPath}`), { statusCode: 404 });
    });

    // Optional: read lite def if you want defaults/consistency
    const lite = await readLiteDef(slug).catch(() => ({}));

    const inputs: CreatureInputs = {
      id: slug,
      name: String(req.body?.name ?? lite?.identity?.char_name ?? slug),
      classTag: String(req.body?.classTag ?? "Shaper"),
      numericId: Number(req.body?.numericId ?? Date.now()),
      stats: {
        creature_affinity: Number(req.body?.stats?.creature_affinity ?? 10),
        chaos_mastery:     Number(req.body?.stats?.chaos_mastery     ?? 10),
        kinesthetic:       Number(req.body?.stats?.kinesthetic       ?? 10),
        lucidity:          Number(req.body?.stats?.lucidity          ?? 10),
        terrain_control:   Number(req.body?.stats?.terrain_control   ?? 10)
      },
      level: 1,
      xp_current: 0,
      xp_to_next: 100,
      xp_reward_on_defeat: 10,
      defaultFpsBattle: Number(req.body?.defaultFpsBattle ?? 12),
      defaultFpsOverworld: Number(req.body?.defaultFpsOverworld ?? 8)
    };

    const GODOT_PROJECT_ROOT = await discoverGodotProjectRoot();

    // Write .tres + AnimMeta into the Godot repo
    await generateOverworldVisual({ projectRoot: GODOT_PROJECT_ROOT, inputs });
    if (req.body?.writeBattleVisual === true) {
      await generateBattleVisual({ projectRoot: GODOT_PROJECT_ROOT, inputs });
    }
    await generateCreature({ projectRoot: GODOT_PROJECT_ROOT, inputs });
    await writeOverworldAnimMeta({ projectRoot: GODOT_PROJECT_ROOT, inputs, ulpcManifestPath: manifestPath });

    return res.json({ ok: true });
  } catch (err: any) {
    const code = err?.statusCode ?? 500;
    return res.status(code).json({ ok: false, message: String(err?.message ?? err) });
  }
});
