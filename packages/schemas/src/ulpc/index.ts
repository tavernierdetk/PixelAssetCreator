import buildJson from "./ulpc.build.schema.enum.json" with { type: "json" };

// Re-export as a stable named export
export const build = buildJson as unknown as object;
