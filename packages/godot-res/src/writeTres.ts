export type TresPrimitive = string | number | boolean | null;

export interface TresArray extends Array<TresPrimitive | TresObject | TresArray> {}

export interface TresObject {
  [key: string]: TresPrimitive | TresObject | TresArray;
}

export type TresValue = TresPrimitive | TresObject | TresArray;

function renderValue(v: TresValue): string {
  if (typeof v === "string") {
    // Allow Godot references to pass through (pre-wrapped upstream)
    if (v.startsWith("ExtResource(") || v.startsWith("SubResource(")) return v;
    return JSON.stringify(v);
  }
  if (typeof v === "number" || typeof v === "boolean" || v === null) {
    return String(v);
  }
  if (Array.isArray(v)) {
    return "[" + v.map(renderValue).join(", ") + "]";
  }
  // object/dictionary
  const parts = Object.entries(v).map(
    ([k, vv]) => JSON.stringify(k) + " = " + renderValue(vv as TresValue)
  );
  return "{\n" + parts.map((s) => "  " + s).join(",\n") + "\n}";
}

export function renderTres(params: {
  scriptClass: string;
  format?: number;
  extScripts?: { id: string; path: string; type?: string }[];
  extResources?: { id: string; path: string; type?: string }[];
  resource: TresObject;
}): string {
  const { scriptClass, format = 3, extScripts = [], extResources = [], resource } = params;

  const header = `[gd_resource type="Resource" script_class="${scriptClass}" load_steps=${2 + extResources.length} format=${format}]`;

  const extScriptLines = extScripts.map(
    (e) => `[ext_resource type="Script" path="${e.path}" id="${e.id}"]`
  );
  const extResLines = extResources.map(
    (e) => `[ext_resource type="${e.type ?? "Resource"}" path="${e.path}" id="${e.id}"]`
  );

  const bodyLines: string[] = [];
  bodyLines.push("[resource]");
  const scriptId = extScripts[0]?.id ?? "1_script";
  bodyLines.push(`script = ExtResource("${scriptId}")`);
  for (const [k, v] of Object.entries(resource)) {
    bodyLines.push(`${k} = ${renderValue(v as TresValue)}`);
  }

  return [header, "", ...extScriptLines, ...extResLines, "", ...bodyLines, ""].join("\n");
}
