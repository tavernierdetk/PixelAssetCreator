//Users/alexandredube-cote/entropy/pixelart-backbone/packages/pipeline/src/prompt.ts
import type { CharacterLite} from "@pixelart/schemas";

type ProjectSettingsLike = { aesthetics?: string };

/** Builds a concise, deterministic portrait prompt from character + project settings. */

export function buildPortraitPrompt(def: CharacterLite, settings: ProjectSettingsLike): string {
  const a = settings?.aesthetics?.trim();
  const i = def.identity;
  const p = def.physical;
  const traits = def.personality?.traits?.slice(0, 6).join(", ");

  // Keep this short; models follow short precise prompts better.
  return [
    a ? `Art direction: ${a}.` : null,
    `Full-body character portrait, 3/4 view, neutral stance.`,
    `Character: ${i?.char_name ?? "Unnamed"}; age:${p?.age_range}; height:${p?.height_category}; build:${p?.build}.`,
    `Colors: skin ${p?.skin_tone}, hair ${p?.hair_color}, eyes ${p?.eye_color}.`,
    traits ? `Personality hints: ${traits}.` : null,
    `Ensure the entire character fits within frame from head to feet, clear silhouette, clean edges.`,
    `Do NOT add text, watermarks, or borders.`
  ].filter(Boolean).join(" ");
}


export function buildIdlePrompt(def: CharacterLite, settings: any) {
  const aesthetic = settings?.image?.aesthetic ?? settings?.aesthetic ?? "16-bit SNES pixel art";
  const style = settings?.image?.idleStyle ?? "idle animation frame, full body or 3/4 view, neutral background";
  return [
    "Pixel art idle frame for a game sprite.",
    `Aesthetic: ${aesthetic}.`,
    `Character: ${def.identity?.char_name ?? "Unnamed"}.`,
    `Traits: ${(def.personality?.traits ?? []).join(", ")}.`,
    `Look: build=${def.physical?.build}, hair=${def.physical?.hair_color}, eyes=${def.physical?.eye_color}.`,
    style,
    "No text. No watermark."
  ].join(" ");
}
