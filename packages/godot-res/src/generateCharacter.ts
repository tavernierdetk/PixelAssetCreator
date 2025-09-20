import fs from "node:fs/promises";
import path from "node:path";
import { renderTres } from "./writeTres.js";

// Inputs coming from your Vite UI:
export type CreatureInputs = {
  id: string;          // "Elara"
  name: string;        // "Elara"
  numericId: number;   // 10001
  classTag: string;    // "Shaper"
  stats: {
    creature_affinity: number; chaos_mastery: number; kinesthetic: number;
    lucidity: number; terrain_control: number;
  };
  level: number; xp_current: number; xp_to_next: number; xp_reward_on_defeat: number;
  // fps defaults (used when no per-anim override):
  defaultFpsBattle: number;      // e.g. 12
  defaultFpsOverworld: number;   // e.g. 8
};

export async function generateOverworldVisual(params: {
  projectRoot: string;   // absolute filesystem path to Godot project root
  inputs: CreatureInputs;
}) {
  const { projectRoot, inputs } = params;
  const charDir = path.join(projectRoot, "Assets/Characters", inputs.id, "Default");
  const tresPath = path.join(charDir, `${inputs.id}_Overworld_CharacterVisual.tres`);

  const tres = renderTres({
    scriptClass: "CharacterVisual",
    extScripts: [{ id: "1_vis", path: "res://System/CombatScreen/BattleActors/CharacterVisual.gd" }],
    resource: {
      character_id: inputs.id,
      animations_root: `res://Assets/Characters/${inputs.id}/Default/ulpc_frames`,
      default_fps: inputs.defaultFpsOverworld
    }
  });
  await fs.mkdir(charDir, { recursive: true });
  await fs.writeFile(tresPath, tres, "utf8");
  return tresPath;
}

export async function generateBattleVisual(params: {
  projectRoot: string;
  inputs: CreatureInputs;
  battleAnimationsRoot?: string; // allow override; default to Battle subdir layout
}) {
  const { projectRoot, inputs, battleAnimationsRoot } = params;
  const charDir = path.join(projectRoot, "Assets/Characters", inputs.id, "Default");
  const tresPath = path.join(charDir, `${inputs.id}_Battle_CharacterVisual.tres`);

  const root = battleAnimationsRoot ??
    `res://Assets/Characters/${inputs.id}/Default/Animations/Battle`;

  const tres = renderTres({
    scriptClass: "CharacterVisual",
    extScripts: [{ id: "1_vis", path: "res://System/CombatScreen/BattleActors/CharacterVisual.gd" }],
    resource: {
      character_id: inputs.id,
      animations_root: root,
      default_fps: inputs.defaultFpsBattle
    }
  });
  await fs.mkdir(charDir, { recursive: true });
  await fs.writeFile(tresPath, tres, "utf8");
  return tresPath;
}

export async function generateCreature(params: {
  projectRoot: string;
  inputs: CreatureInputs;
}) {
  const { projectRoot, inputs } = params;
  const charDir = path.join(projectRoot, "Assets/Characters", inputs.id);
  const tresPath = path.join(charDir, `${inputs.id}_Creature.tres`);

  const tres = renderTres({
    scriptClass: "Creature",
    extScripts: [{ id: "1_creature", path: "res://System/Creatures/Creature.gd" }],
    extResources: [{ id: "2_visual", path: `res://Assets/Characters/${inputs.id}/Default/${inputs.id}_Battle_CharacterVisual.tres`, type: "Resource" }],
    resource: {
      // identity
      name: inputs.name,
      class_tag: inputs.classTag,
      id: inputs.numericId,
      // stats (exactly as Creature.gd exports)
      creature_affinity: inputs.stats.creature_affinity,
      chaos_mastery: inputs.stats.chaos_mastery,
      kinesthetic: inputs.stats.kinesthetic,
      lucidity: inputs.stats.lucidity,
      terrain_control: inputs.stats.terrain_control,
      // runtime flags
      is_fainted: false,
      skip_turn_flag: false,
      is_dead: false,
      // empty lists to start; UI can seed Skills/Statuses later
      skills: [],
      statuses_stacks: [],
      visual: `ExtResource("2_visual")`,
      level: inputs.level,
      xp_current: inputs.xp_current,
      xp_to_next: inputs.xp_to_next,
      xp_reward_on_defeat: inputs.xp_reward_on_defeat,
      persist_path: `res://Assets/Characters/${inputs.id}/${inputs.id}_Creature.tres`,
      chaos_dials: {
        alpha: 0.0, clip_hi: 1.3, clip_lo: 0.7, clip_mode: "winsor", sigma_v0: 0.05, soft_k: 2.0
      }
    }
  });

  await fs.mkdir(charDir, { recursive: true });
  await fs.writeFile(tresPath, tres, "utf8");
  return tresPath;
}

// Optional: derive Overworld AnimMeta from ULPC manifest fps
export async function writeOverworldAnimMeta(params: {
  projectRoot: string;
  inputs: CreatureInputs;
  ulpcManifestPath: string;  // path to {slug}_sprite_manifest.json
}) {
  const { projectRoot, inputs, ulpcManifestPath } = params;
  const j = JSON.parse(await fs.readFile(ulpcManifestPath, "utf8"));
  const loop_overrides: Record<string, boolean> = {
    "Idle_*": true, "Walk_*": true, "Run_*": true, "Hurt_*": false
  };
  const fps_overrides: Record<string, number> = {};
  for (const [anim, def] of Object.entries<any>(j.animations ?? {})) {
    const key = (anim.charAt(0).toUpperCase() + anim.slice(1) + "_*");
    if (typeof def.fps === "number") fps_overrides[key] = def.fps;
  }
  const out = { fps_overrides, loop_overrides, notes: "Generated from ULPC manifest" };
  const outPath = path.join(projectRoot, "Assets/Characters", inputs.id, "Default", `${inputs.id}_Overworld_AnimMeta.json`);
  await fs.writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  return outPath;
}
