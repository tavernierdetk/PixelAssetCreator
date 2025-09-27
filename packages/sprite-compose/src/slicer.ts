// packages/sprite-compose/src/slicer.ts
import path from "node:path";
import fsp from "node:fs/promises";
import sharp from "sharp";

export type OrientationName = "front" | "back" | "left" | "right";
export type GridInfo = {
  frame_w: number;
  frame_h: number;
  rows: number;        // total rows on the sheet
  cols: number;        // columns per row
  directions?: OrientationName[]; // if multiple orientations (rows), order they appear
};

export type SliceStrategy =
  | "meta"          // use metadata from defs (preferred)
  | "force_64"      // assume 64x64 tiles
  | "force_square"  // assume square tiles derived from height/rows
  | "single_row";   // one row, infer cols

export type SliceOptions = {
  sheetPath: string;            // PNG path to slice
  outDir: string;               // directory to write frames into
  slug: string;                 // used in filenames
  animationName: string;        // e.g., "idle", "walk"
  zeroPad?: number;             // default 3
  fps?: number;                 // default 8 (manifest only)
  orientationDirs?: boolean;    // put frames into Animation_Orientation subfolders
  grid: GridInfo;               // resolved grid info (already chosen by caller)
};

function zpad(n: number, width: number) {
  const s = String(n);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

function titleCaseFirst(s: string) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export async function sliceSheetByGrid(opts: SliceOptions): Promise<{
  totalFrames: number;
  framesPerRow: number;
  rows: number;
  written: Array<{ path: string; w: number; h: number }>;
  manifest: {
    animation: string;
    fps: number;
    frame_size: { w: number; h: number };
    orientations?: OrientationName[];
    frames: Record<string, string[]>; // key: folder, value: ordered frames
  };
}> {
  const {
    sheetPath, outDir, slug,
    animationName, zeroPad = 3, fps = 8, orientationDirs = true, grid
  } = opts;

  await fsp.mkdir(outDir, { recursive: true });
  const img = sharp(sheetPath);
  const meta = await img.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error(`slicer: cannot read dimensions: ${sheetPath}`);

  const { frame_w, frame_h, rows, cols, directions } = grid;
  if (W % frame_w !== 0 || H % frame_h !== 0) {
    throw new Error(`slicer: sheet (${W}x${H}) not divisible by frame (${frame_w}x${frame_h})`);
  }
  const colsActual = W / frame_w;
  const rowsActual = H / frame_h;
  if (colsActual !== cols || rowsActual !== rows) {
    // Not fatal, but warn by throwing explicit error so caller can fall back or surface detail
    throw new Error(`slicer: grid mismatch (expected ${cols}x${rows}, got ${colsActual}x${rowsActual})`);
  }

  const orientNames: OrientationName[] =
    directions && directions.length === rows
      ? directions
      : (rows > 1 ? (["back", "left", "front", "right"].slice(0, rows) as OrientationName[]) : []);

  const desiredCycle: OrientationName[] = ["back", "left", "front", "right"];
  let rowsWithOrientation: Array<{ orientation: OrientationName; rowIndex: number }> =
    Array.from({ length: rows }, (_, idx) => ({ orientation: orientNames[idx] ?? "back", rowIndex: idx }));

  if (orientNames.length === rows && orientNames.length >= desiredCycle.length) {
    const used = new Set<number>();
    const reordered: Array<{ orientation: OrientationName; rowIndex: number }> = [];

    for (const face of desiredCycle) {
      const entry = rowsWithOrientation.find((candidate) => candidate.orientation === face && !used.has(candidate.rowIndex));
      if (entry) {
        reordered.push(entry);
        used.add(entry.rowIndex);
      }
    }

    if (reordered.length === desiredCycle.length) {
      const remainder = rowsWithOrientation.filter((entry) => !used.has(entry.rowIndex));
      rowsWithOrientation = [...reordered, ...remainder];
    }
  }

  const written: Array<{ path: string; w: number; h: number }> = [];
  const framesByFolder: Record<string, string[]> = {};
  let totalFrames = 0;

  for (const { orientation, rowIndex } of rowsWithOrientation) {
    const folderBase = orientationDirs
      ? `${titleCaseFirst(animationName)}_${orientation}`
      : animationName;

    const baseDir = path.join(outDir, folderBase);
    await fsp.mkdir(baseDir, { recursive: true });

    for (let c = 0; c < cols; c++) {
      const left = c * frame_w;
      const top = rowIndex * frame_h;
      const idx = rowIndex * cols + c;
      const name = `${slug}_${animationName}_${zpad(idx, zeroPad)}.png`;
      const outPath = path.join(baseDir, name);

      const frame = await sharp(sheetPath).extract({ left, top, width: frame_w, height: frame_h }).png().toFile(outPath);
      written.push({ path: outPath, w: frame.width ?? frame_w, h: frame.height ?? frame_h });

      (framesByFolder[folderBase] ||= []).push(outPath);
      totalFrames++;
    }
  }

  return {
    totalFrames,
    framesPerRow: cols,
    rows,
    written,
    manifest: {
      animation: animationName,
      fps,
      frame_size: { w: grid.frame_w, h: grid.frame_h },
      orientations: rowsWithOrientation.length ? rowsWithOrientation.map((entry) => entry.orientation) : undefined,
      frames: framesByFolder,
    }
  };
}
