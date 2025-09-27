import { Router, type Request, type Response } from "express";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { ASSET_ROOT, readLiteDef, readProjectSettings, readUlpcBuild } from "@pixelart/config";
import {
  generateCreature,
  generateOverworldVisual,
  generateBattleVisual,
  writeOverworldAnimMeta,
  type CreatureInputs
} from "@pixelart/godot-res";
import { composeULPCExport } from "@pixelart/sprite-compose";

export const godotRouter: import("express").Router = Router();

function escapeTresString(value: string | number | boolean | null | undefined): string {
  const raw = value ?? "";
  const str = String(raw);
  return str.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function normalizeClassTag(tag: string | undefined | null): string {
  const base = (tag ?? "shaper").toString().trim();
  return base.length ? base : "shaper";
}

function computeDerivedStats(stats: CreatureInputs["stats"]) {
  const kin = Number(stats.kinesthetic ?? 0);
  const terrain = Number(stats.terrain_control ?? 0);
  const hp = (kin * 10) + (terrain * 5);
  const spd = 50 + (kin * 3);
  const purge = 20 + kin;
  const thresh = 50 + kin;
  return {
    hp,
    spd,
    acdb: spd,
    phys_purge_rate: purge,
    phys_thresh: thresh,
    ment_purge_rate: purge,
    ment_thresh: thresh,
  };
}

async function writeLocalCreatureResources(params: {
  charDir: string;
  inputs: CreatureInputs;
}) {
  const { charDir, inputs } = params;
  const id = inputs.id;
  const classTag = normalizeClassTag(inputs.classTag);
  const derived = computeDerivedStats(inputs.stats);

  await fs.mkdir(charDir, { recursive: true });

  const creatureTresPath = join(charDir, `${id}_Creature.tres`);
  const overworldTresPath = join(charDir, `${id}_OverworldPlayer.tres`);

  const creatureTres = `[` +
`gd_resource type="Resource" script_class="Creature" load_steps=4 format=3]` + "\n\n" +
`[ext_resource type="Script" path="res://Scripts/Creature.gd" id="1_creature"]` + "\n" +
`[ext_resource type="Script" path="res://System/CombatScreen/BattleActors/CharacterVisual.gd" id="2_visual"]` + "\n\n" +
`[sub_resource type="Resource" id="CharacterVisual_${id}"]` + "\n" +
`script = ExtResource("2_visual")` + "\n" +
`character_id = "${escapeTresString(id)}"` + "\n" +
`animations_root = "res://Assets/Characters/${escapeTresString(id)}/Default/ulpc_frames"` + "\n" +
`default_fps = ${Number(inputs.defaultFpsOverworld ?? 8)}` + "\n\n" +
`[resource]` + "\n" +
`script = ExtResource("1_creature")` + "\n" +
`name = "${escapeTresString(inputs.name)}"` + "\n" +
`class_tag = "${escapeTresString(classTag)}"` + "\n" +
`id = ${Number(inputs.numericId ?? Date.now())}` + "\n" +
`persistence_path = ""` + "\n" +
`creature_affinity = ${Number(inputs.stats.creature_affinity ?? 0)}` + "\n" +
`chaos_mastery = ${Number(inputs.stats.chaos_mastery ?? 0)}` + "\n" +
`kinesthetic = ${Number(inputs.stats.kinesthetic ?? 0)}` + "\n" +
`lucidity = ${Number(inputs.stats.lucidity ?? 0)}` + "\n" +
`terrain_control = ${Number(inputs.stats.terrain_control ?? 0)}` + "\n" +
`hp = ${derived.hp}` + "\n" +
`hp_current = ${derived.hp}` + "\n" +
`spd = ${derived.spd}` + "\n" +
`acdb = ${derived.acdb}` + "\n" +
`phys_purge_rate = ${derived.phys_purge_rate}` + "\n" +
`phys_thresh = ${derived.phys_thresh}` + "\n" +
`ment_purge_rate = ${derived.ment_purge_rate}` + "\n" +
`ment_thresh = ${derived.ment_thresh}` + "\n" +
`is_fainted = false` + "\n" +
`skip_turn_flag = false` + "\n" +
`is_dead = false` + "\n" +
`skills = []` + "\n" +
`statuses_stacks = []` + "\n" +
`visual = SubResource("CharacterVisual_${escapeTresString(id)}")` + "\n" +
`level = ${Number(inputs.level ?? 1)}` + "\n" +
`xp_current = ${Number(inputs.xp_current ?? 0)}` + "\n" +
`xp_to_next = ${Number(inputs.xp_to_next ?? 100)}` + "\n" +
`xp_reward_on_defeat = ${Number(inputs.xp_reward_on_defeat ?? 10)}` + "\n" +
`persist_path = "res://Assets/Characters/${escapeTresString(id)}/${escapeTresString(id)}_Creature.tres"` + "\n" +
`chaos_dials = {` + "\n" +
`"alpha": 0.0,` + "\n" +
`"clip_hi": 1.3,` + "\n" +
`"clip_lo": 0.7,` + "\n" +
`"clip_mode": "winsor",` + "\n" +
`"sigma_v0": 0.05,` + "\n" +
`"soft_k": 2.0` + "\n" +
`}` + "\n";

  const nodeName = `${id.charAt(0).toUpperCase()}${id.slice(1)}Overworld`;
  const overworldScene = `[` + `gd_scene load_steps=2 format=3]` + "\n\n" +
`[ext_resource type="Script" path="res://Scripts/OverworldPlayer.gd" id="1_player"]` + "\n\n" +
`[node name="${escapeTresString(nodeName)}" type="CharacterBody2D"]` + "\n" +
`script = ExtResource("1_player")` + "\n" +
`creature_path = "res://Assets/Characters/${escapeTresString(id)}/${escapeTresString(id)}_Creature.tres"` + "\n" +
`height_target_px = 96` + "\n";

  await fs.writeFile(creatureTresPath, creatureTres, "utf8");
  await fs.writeFile(overworldTresPath, overworldScene, "utf8");

  return { creatureTresPath, overworldTresPath };
}

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
async function handleExport(req: Request, res: Response) {
  try {
    const slug: string = req.params.slug;
    if (!slug || !/^[a-z0-9._-]+$/i.test(slug)) {
      return res.status(400).json({ ok: false, message: "Bad slug" });
    }

    // Where ULPC exporter places artifacts for this slug
    const charDir = join(ASSET_ROOT, slug);
    // Common manifest filename used by our ULPC export
    const manifestPath = join(charDir, `${slug}_sprite_manifest.json`);
    let manifestExists = true;

    try {
      const ulpcBuild = await readUlpcBuild(slug);
      await composeULPCExport({ build: ulpcBuild, outBaseDir: charDir, slug });
    } catch (err: any) {
      manifestExists = false;
      console.warn?.("[godot.export] ulpc_refresh_failed", { slug, error: err?.message });
    }

    await fs.access(manifestPath).catch((err) => {
      manifestExists = false;
      console.warn?.("[godot.export] manifest_missing", { slug, manifestPath, err: err?.message });
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

    let godotProjectRoot: string | null = null;
    try {
      godotProjectRoot = await discoverGodotProjectRoot();
    } catch {
      godotProjectRoot = null;
    }

    if (godotProjectRoot) {
      console.info?.("[godot.export] writing_project_resources", { slug, godotProjectRoot });
      await generateOverworldVisual({ projectRoot: godotProjectRoot, inputs });
      if (req.body?.writeBattleVisual === true) {
        await generateBattleVisual({ projectRoot: godotProjectRoot, inputs });
      }
      await generateCreature({ projectRoot: godotProjectRoot, inputs });
      if (manifestExists) {
        await writeOverworldAnimMeta({ projectRoot: godotProjectRoot, inputs, ulpcManifestPath: manifestPath });
      }
    }

    console.info?.("[godot.export] writing_local_resources", { slug, charDir });
    await writeLocalCreatureResources({ charDir, inputs });

    if (!manifestExists) {
      return res.status(207).json({
        ok: true,
        partial: true,
        message: `Export completed locally, but ULPC manifest not found at ${manifestPath}. AnimMeta was skipped.`,
      });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    const code = err?.statusCode ?? 500;
    return res.status(code).json({ ok: false, message: String(err?.message ?? err) });
  }
}

godotRouter.post("/characters/:slug/export-godot", handleExport);
godotRouter.post("/api/characters/:slug/export-godot", handleExport);
