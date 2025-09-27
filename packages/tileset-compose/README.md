# @pixelart/tileset-compose

Importable library to generate 32×32 blob-47 autotiles using OpenAI Images + Sharp.
Supports:
- **Per-tile prompts** (47 requests) → quantize → downscale → stitch.
- **Mask-first**: generate base texture + 47 binary masks → composite → quantize → downscale → stitch.
- Writes a `tileset.manifest/1.0` JSON.

### Usage

```ts
import { generateBlob47Tileset } from "@pixelart/tileset-compose";

await generateBlob47Tileset({
  dictPath: new URL("../prompts/blob47_grass.json", import.meta.url).pathname,
  options: {
    outDir: "/tmp/tiles/grass_v1",
    paletteName: "roman_steampunk",
    size: "1024x1024",
    transparentBG: true,
    quantize: true,
    tileSize: 32
  }
});
