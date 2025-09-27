export type RGB = [number, number, number];

export type OpenAIImageSize =
  | "256x256" | "512x512" | "1024x1024"
  | "1536x1024" | "1024x1536"
  | "1792x1024" | "1024x1792"
  | "auto";

export type TilesetMaterial =
  | "grass" | "dirt" | "stone" | "sand" | "water";

export type Blob47TileSpec = {
  id: number;                  // 1..47 (48 is empty)
  name: string;                // "edge_north", etc.
  prompt: string;              // tile-specific rules
};

export type PromptDictionary = {
  schema: "blob47.prompt/1.0";
  material: TilesetMaterial | string;
  global_preamble: string;     // shared style constraints
  tiles: Blob47TileSpec[];     // 47 entries
};

export type MaskDictionary = {
  schema: "blob47.mask/1.0";
  tiles: Blob47TileSpec[];     // same ids, mask-specific prompts
};

export type TilesetComposeOptions = {
  outDir: string;                        // output directory for generated tileset
  paletteName?: string;                  // e.g. "roman_steampunk"
  paletteRGB?: RGB[];                    // explicit palette colors
  size?: OpenAIImageSize;                // default "1024x1024"
  tileSize?: number;                     // default 32
  sheetCols?: number;                    // default 8
  sheetRows?: number;                    // default 6
  transparentBG?: boolean;               // default true
  quantize?: boolean;                    // default true
};

export type TilesetComposeResult = {
  sheetPath: string;                     // final 8x6 PNG
  tilePaths: string[];                   // individual 32×32 tiles
  manifestPath: string;                  // JSON manifest path
};

export type MaskFirstOptions = TilesetComposeOptions & {
  baseTexturePrompt: string;             // seamless 1024×1024 material texture
  maskDictPath: string;                  // JSON with masks
};

export type TilesetManifest = {
  schema: "tileset.manifest/1.0";
  material: string;
  engine_order: "blob47";
  grid: { cols: number; rows: number; tile: number };
  palette: {
    name?: string;
    rgb: RGB[];
  };
  openai: {
    model: string;           // e.g. gpt-image-1
    size: OpenAIImageSize;
    transparent: boolean;
  };
  tiles: Array<{
    id: number;
    name: string;
    file: string;            // relative path to 32×32 tile
    promptHash?: string;     // basic hash of prompt used
  }>;
  sheet: {
    file: string;            // relative path to 8×6 sheet
    layout: "row-major";
  };
};
