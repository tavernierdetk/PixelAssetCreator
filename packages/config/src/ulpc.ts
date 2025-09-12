import * as fs from "node:fs";
import * as path from "node:path";

export function resolveUlpcSheetDefs(opts?: { cwd?: string; extraCandidates?: string[] }): string {
  const ROOT = opts?.cwd ?? process.cwd();
  const candidates = [
    process.env.ULPC_SHEET_DEFS || "",
    path.join(ROOT, "packages", "sprite-catalog", "vendor", "ulpc", "sheet_definitions"),
    path.join(ROOT, "packages", "sprite-catalog", "vendor", "ulpc-src", "sheet_definitions"),
    path.join(ROOT, "assets", "ulpc", "sheet_definitions"),
    path.join(ROOT, "assets", "sheet_definitions"),
    path.join(ROOT, "packages", "Universal-LPC-Spritesheet-Character-Generator", "sheet_definitions"),
    ...(opts?.extraCandidates ?? []),
  ].filter(Boolean);

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    const list = candidates.map((p) => ` - ${p}`).join("\n");
    throw new Error(
      `[config] ULPC sheet_definitions not found.\nTried:\n${list}\n` +
      `Hint: export ULPC_SHEET_DEFS=/absolute/path/to/Universal-LPC-Spritesheet-Character-Generator/sheet_definitions`
    );
  }
  return found;
}

export function resolveUlpcRoot(opts?: { cwd?: string; extraCandidates?: string[] }): string {
  return path.dirname(resolveUlpcSheetDefs(opts));
}
