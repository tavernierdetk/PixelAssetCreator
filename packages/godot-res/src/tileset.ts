import fs from "node:fs/promises";
import path from "node:path";

export type RGBA = [number, number, number, number];

export type PeerKey =
  | "top_side" | "right_side" | "bottom_side" | "left_side"
  | "top_left_corner" | "top_right_corner" | "bottom_right_corner" | "bottom_left_corner";

export interface TerrainDef { id: number; name: string; color: RGBA; }
export interface TerrainSetDef { id: number; mode: "MATCH_CORNERS_AND_SIDES"; terrains: TerrainDef[]; }

export interface TileRule {
  coord: [number, number]; // [col,row], 0-based
  terrainSet?: number | null;
  terrain?: number;        // terrain id within the set
  peers?: PeerKey[];       // autotile flags set to 1
  collision?: { preset?: string; polygon?: number[] };
  custom?: Record<string, unknown>;
}

export interface RulesConfig {
  meta: { name: string; tileSize: number; indexBase?: 0 | 1 };
  terrainSets: TerrainSetDef[];
  tiles: TileRule[];
  collisionPresets?: Record<string, number[]>;
}

function color4([r, g, b, a]: RGBA): string {
  return `Color(${r}, ${g}, ${b}, ${a})`;
}
function vec2i(x: number, y: number): string { return `Vector2i(${x}, ${y})`; }

/**
 * Write a minimal Godot 4 TileSet .tres using one Texture2D (atlas) and one TileSetAtlasSource.
 * extResourcePath should be a valid res:// path as it will be embedded in the .tres.
 */
export async function writeTileSetTres(params: {
  outDir: string;
  atlasPngName: string;         // file name placed alongside the .tres in the project mirror
  extResourcePath: string;      // e.g., res://Assets/Tilesets/<slug>/<atlasPngName>
  rules: RulesConfig;
  fileName?: string;            // default tileset.tres
}): Promise<string> {
  const { outDir, atlasPngName, extResourcePath, rules } = params;
  const fileName = params.fileName ?? "tileset.tres";
  const extId = "1_tex";
  const atlasId = "TileSetAtlasSource_main";
  const loadSteps = 3; // 1 ext + 1 sub + 1 resource
  const uid = `uid://auto_${rules.meta.name}`;

  const header: string[] = [];
  header.push(`[gd_resource type="TileSet" load_steps=${loadSteps} format=3 uid="${uid}"]`);
  header.push("");
  header.push(`[ext_resource type="Texture2D" path="${extResourcePath}" id="${extId}"]`);
  header.push("");
  header.push(`[sub_resource type="TileSetAtlasSource" id="${atlasId}"]`);
  header.push(`texture = ExtResource("${extId}")`);
  header.push(`texture_region_size = ${vec2i(rules.meta.tileSize, rules.meta.tileSize)}`);

  const tileLines: string[] = [];
  for (const t of rules.tiles) {
    const [c, r] = t.coord;
    tileLines.push(`${c}:${r}/0 = 0`);
    if (typeof t.terrainSet === "number") tileLines.push(`${c}:${r}/0/terrain_set = ${t.terrainSet}`);
    if (typeof t.terrain === "number") tileLines.push(`${c}:${r}/0/terrain = ${t.terrain}`);
    if (t.peers && t.peers.length) {
      for (const p of t.peers) tileLines.push(`${c}:${r}/0/terrains_peering_bit/${p} = 1`);
    }
    if (t.collision) {
      const pts = t.collision.polygon;
      if (Array.isArray(pts) && pts.length >= 4) {
        const packed = `PackedVector2Array(${pts.join(", ")})`;
        tileLines.push(`${c}:${r}/0/physics_layer_0/polygon_0/points = ${packed}`);
      }
    }
  }

  const resLines: string[] = [];
  resLines.push(`[resource]`);
  resLines.push(`physics_layer_0/collision_layer = 1`);
  for (const ts of rules.terrainSets) {
    resLines.push(`terrain_set_${ts.id}/mode = 0`); // MATCH_CORNERS_AND_SIDES = 0
    for (const t of ts.terrains) {
      resLines.push(`terrain_set_${ts.id}/terrain_${t.id}/name = "${t.name}"`);
      resLines.push(`terrain_set_${ts.id}/terrain_${t.id}/color = ${color4(t.color)}`);
    }
  }
  resLines.push(`sources/0 = SubResource("${atlasId}")`);

  const out = [
    ...header,
    ...tileLines,
    "",
    ...resLines,
    ""
  ].join("\n");

  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, out, "utf8");
  return filePath;
}

export function deriveCoast16Rules(params: {
  name: string;
  tileSize: number;
  grid: { cols: number; rows: number };
  tilesByIndex: Array<{ id: number; name: string }>; // 0..15 with names "mask_...."
  materialsAB?: { A: { name: string }; B: { name: string } };
}): RulesConfig {
  const { name, tileSize, grid, tilesByIndex, materialsAB } = params;
  const Aname = materialsAB?.A?.name ?? "Land";
  const Bname = materialsAB?.B?.name ?? "Water";
  const terrainSets: TerrainSetDef[] = [
    { id: 0, mode: "MATCH_CORNERS_AND_SIDES", terrains: [
      { id: 0, name: Aname, color: [0.35, 0.7, 0.35, 1] },
      { id: 1, name: Bname, color: [0.2, 0.45, 0.8, 1] },
    ] }
  ];

  // Helpers for bit decoding
  const cornerOrder: Array<"NW"|"NE"|"SE"|"SW"> = ["NW","NE","SE","SW"]; // nibble digits map
  function parseNibble(name: string): number | null {
    const m = name.match(/mask_([01]{4})/i);
    if (!m) return null;
    const bits = m[1];
    // order NW,NE,SE,SW -> bit idx [3..0] or [0..3]? We'll represent as array bools
    // We'll pack into value with bit3=NW, bit2=NE, bit1=SE, bit0=SW
    const bNW = bits.charAt(0) === "1" ? 1 : 0;
    const bNE = bits.charAt(1) === "1" ? 1 : 0;
    const bSE = bits.charAt(2) === "1" ? 1 : 0;
    const bSW = bits.charAt(3) === "1" ? 1 : 0;
    return (bNW<<3) | (bNE<<2) | (bSE<<1) | (bSW);
  }
  function hasCorner(nibble: number, corner: "NW"|"NE"|"SE"|"SW", isWater: boolean): boolean {
    const mask = corner === "NW" ? 0b1000 : corner === "NE" ? 0b0100 : corner === "SE" ? 0b0010 : 0b0001;
    const bit = (nibble & mask) !== 0;
    return isWater ? bit : !bit; // land is inverse of water nibble
  }
  function sidePresent(nibble: number, side: "top"|"right"|"bottom"|"left", isWater: boolean): boolean {
    const pairs: Record<typeof side, ["NW"|"NE"|"SE"|"SW", "NW"|"NE"|"SE"|"SW"]> = {
      top: ["NW","NE"], right: ["NE","SE"], bottom: ["SE","SW"], left: ["SW","NW"],
    };
    const [a,b] = pairs[side];
    return hasCorner(nibble, a, isWater) && hasCorner(nibble, b, isWater);
  }

  const tiles: TileRule[] = [];
  for (let idx = 0; idx < tilesByIndex.length; idx++) {
    const spec = tilesByIndex[idx];
    const r = Math.floor(idx / grid.cols), c = idx % grid.cols;
    const nibble = parseNibble(spec.name);
    let terrain = 0; // default Land
    if (nibble === 0b1111) terrain = 1; // all water
    else if (nibble === 0b0000) terrain = 0; // all land
    else terrain = 0; // mixed → paint land as the terrain id
    const isWater = terrain === 1;

    const peers: PeerKey[] = [];
    // corners
    if (hasCorner(nibble ?? 0, "NW", isWater)) peers.push("top_left_corner");
    if (hasCorner(nibble ?? 0, "NE", isWater)) peers.push("top_right_corner");
    if (hasCorner(nibble ?? 0, "SE", isWater)) peers.push("bottom_right_corner");
    if (hasCorner(nibble ?? 0, "SW", isWater)) peers.push("bottom_left_corner");
    // sides
    if (sidePresent(nibble ?? 0, "top", isWater)) peers.push("top_side");
    if (sidePresent(nibble ?? 0, "right", isWater)) peers.push("right_side");
    if (sidePresent(nibble ?? 0, "bottom", isWater)) peers.push("bottom_side");
    if (sidePresent(nibble ?? 0, "left", isWater)) peers.push("left_side");

    tiles.push({ coord: [c, r], terrainSet: 0, terrain, peers });
  }

  return {
    meta: { name, tileSize, indexBase: 0 },
    terrainSets,
    tiles,
  };
}

