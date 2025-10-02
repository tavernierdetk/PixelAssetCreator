// ──────────────────────────────────────────────────────────────────────────────
// packages/tileset-compose/src/patterns/registry.ts
// ──────────────────────────────────────────────────────────────────────────────
export type TilesetPatternId = "blob47" | "coast16";


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
coast16: {
id: "coast16",
displayName: "Coast 16 (4×4)",
tileSize: 32,
grid: { cols: 4, rows: 4 },
slots: 16,
immutable: true,
docs: "Orthogonal stepped coastline with A/B materials (Land/Water); Wang corner mask order NW,NE,SE,SW.",
},
};


export type PatternKey = keyof typeof PATTERNS;
export function listPatterns() { return Object.values(PATTERNS); }
export function hasPattern(id: string): id is TilesetPatternId { return id in PATTERNS; }
