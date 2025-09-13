// apps/web/src/components/IntermediaryConverter.tsx
import { useState } from "react";

export default function IntermediaryConverter() {
  const [payload, setPayload] = useState(`{
  "intermediary": {
    "body_type": "male",
    "head_type": "heads_human_male.json",
    "categories": [
      { "category": "body", "preferred_colour": "bronze", "items": ["body.json"] },
      { "category": "hair", "preferred_colour": "black", "items": ["hair_afro.json","hair_long.json"] },
      { "category": "legs", "preferred_colour": "lavender", "items": ["legs_pants.json"] },
      { "category": "shoes", "preferred_colour": "brown", "items": ["feet_boots_basic.json"] }
    ]
  },
  "animations": ["idle"],
  "compose": true,
  "slug": "ui_smoke_01"
}`);
  const [resp, setResp] = useState<any>(null);
  const [img, setImg] = useState<string>("");

  const submit = async () => {
    setResp(null); setImg("");
    const r = await fetch("http://localhost:4000/assistant/convert-intermediary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const j = await r.json();
    setResp(j);
    if (j?.composed?.outPath) {
      // If your API serves ASSET_ROOT under /assets, swap local path → URL
      // e.g. /Users/.../assets/characters/<slug>/preview/file.png => http://localhost:4000/assets/<slug>/preview/file.png
      const local = j.composed.outPath as string;
      const ix = local.indexOf("/assets/characters/");
      if (ix >= 0) {
        setImg("http://localhost:4000" + local.slice(ix));
      }
    }
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-semibold">Intermediary → ULPC (Compose)</h2>
      <textarea className="w-full h-64 border p-2 font-mono text-sm"
        value={payload} onChange={e=>setPayload(e.target.value)} />
      <button className="px-3 py-2 rounded bg-black text-white" onClick={submit}>Convert & Compose</button>
      {img && <div><h3 className="font-medium mt-4">Preview</h3><img src={img} alt="preview" className="border" /></div>}
      {resp && <pre className="text-xs bg-gray-50 p-2 overflow-auto border">{JSON.stringify(resp, null, 2)}</pre>}
    </div>
  );
}
