import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@pixelart/log";
import type { PromptDictionary, MaskDictionary, Coast16PromptDictionary } from "./types.js";

const log = createLogger("@tileset/promptLoader");

export async function loadPromptDictionary(dictPath: string): Promise<PromptDictionary> {
  const raw = await fs.readFile(dictPath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed?.schema !== "blob47.prompt/1.0") {
    throw new Error(`invalid_prompt_schema:${parsed?.schema}`);
  }
  if (!Array.isArray(parsed.tiles) || parsed.tiles.length < 47) {
    throw new Error("prompt_dictionary_requires_47_tiles");
  }
  log.info({ dictPath, material: parsed.material }, "prompt_dict_loaded");
  return parsed as PromptDictionary;
}

export async function loadMaskDictionary(dictPath: string): Promise<MaskDictionary> {
  const raw = await fs.readFile(dictPath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed?.schema !== "blob47.mask/1.0") {
    throw new Error(`invalid_mask_schema:${parsed?.schema}`);
  }
  if (!Array.isArray(parsed.tiles) || parsed.tiles.length < 47) {
    throw new Error("mask_dictionary_requires_47_tiles");
  }
  return parsed as MaskDictionary;
}

export function promptsDir(packageRoot: string): string {
  return path.join(packageRoot, "prompts");
}

export async function loadCoast16PromptDictionary(dictPath: string): Promise<Coast16PromptDictionary> {
  const raw = await fs.readFile(dictPath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed?.schema !== "coast16.prompt/1.0-ab-stepped") {
    throw new Error(`invalid_coast16_schema:${parsed?.schema}`);
  }
  if (!Array.isArray(parsed.tiles) || parsed.tiles.length < 16) {
    throw new Error("coast16_dictionary_requires_16_tiles");
  }
  return parsed as Coast16PromptDictionary;
}
