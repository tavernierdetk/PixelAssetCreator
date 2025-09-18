
import buildJson from "./ulpc.build.schema.enum.json" with { type: "json" };
import categoryRefJson from "./category_reference.v1.json" with { type: "json" };

// Stable named exports for browser & server
export const build = buildJson as unknown as object;
export const category_reference = categoryRefJson as unknown as object;