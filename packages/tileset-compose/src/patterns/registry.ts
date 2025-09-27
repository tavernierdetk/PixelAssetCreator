// ──────────────────────────────────────────────────────────────────────────────
// packages/tileset-compose/src/patterns/registry.ts (NEW)
// ──────────────────────────────────────────────────────────────────────────────
export type TilesetPatternId = "blob47";


export interface TilesetPattern {
id: TilesetPatternId;
displayName: string;
tileSize: 32 | 16;
grid: { cols: number; rows: number };
slots: number;
immutable: true;
docs?: string;
}


export const PATTERNS: Record<TilesetPatternId, TilesetPattern> = {
blob47: {
id: "blob47",
displayName: "Blob 47 (8×6)",
tileSize: 32,
grid: { cols: 8, rows: 6 },
slots: 47,
immutable: true,
docs: "Autotile blob-style. 8×6 sheet; 47 used tiles.",
},
};


export type PatternKey = keyof typeof PATTERNS;
export function listPatterns() { return Object.values(PATTERNS); }
export function hasPattern(id: string): id is TilesetPatternId { return id in PATTERNS; }