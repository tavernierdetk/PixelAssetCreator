import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackHeader } from "@/components/BackHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateSceneAsset, listSceneAssets, sceneAssetUrl } from "@/lib/api";

export default function ScenesPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [description, setDescription] = useState("");
  const [latest, setLatest] = useState<string | null>(null);
  const [bust, setBust] = useState<number>(0);

  const listQ = useQuery({
    queryKey: ["sceneAssets", category],
    queryFn: () => listSceneAssets(category || undefined),
  });

  const mGen = useMutation({
    mutationFn: async () => generateSceneAsset({ name: name || undefined, category: category || undefined, description, size }),
    onSuccess: (res) => {
      setLatest(res.url);
      setBust(Date.now());
      qc.invalidateQueries({ queryKey: ["sceneAssets", category] });
    },
  });

  return (
    <div className="space-y-6">
      <BackHeader title="Scene Assets" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generator */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-3">
            <div className="font-medium">Generate Asset</div>
            <div className="grid gap-2 text-sm">
              <div>
                <div className="text-[11px] text-slate-600 mb-1">Category (optional)</div>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="props, decals, ui, ..." />
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">Name (optional)</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="broken-column" />
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">Size</div>
                <select className="border rounded p-2 text-sm w-full" value={size} onChange={(e) => setSize(e.target.value)}>
                  <option>256x256</option>
                  <option>512x512</option>
                  <option>1024x1024</option>
                  <option>1536x1024</option>
                  <option>1024x1536</option>
                  <option>1792x1024</option>
                  <option>1024x1792</option>
                  <option>auto</option>
                </select>
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">Description</div>
                <Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the scene asset (e.g., Small broken column prop, top-down, pixel art, etc.)" />
              </div>
              <div>
                <Button onClick={() => mGen.mutate()} disabled={mGen.isPending || !description.trim()}>
                  {mGen.isPending ? "Generating…" : "Generate"}
                </Button>
              </div>
            </div>
            {latest && (
              <div>
                <div className="text-xs text-slate-600 mb-1">Latest result</div>
                <div className="inline-block bg-checker p-1 border rounded">
                  <img src={`${latest}${bust ? `?v=${bust}` : ""}`} className="max-w-full h-auto image-render-pixel block" alt="scene asset" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Library */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Library</div>
              <button className="text-xs underline" onClick={() => qc.invalidateQueries({ queryKey: ["sceneAssets", category] })}>Refresh</button>
            </div>
            {!listQ.data?.files?.length ? (
              <p className="text-sm text-slate-600">No assets yet. Generate one on the left.</p>
            ) : (
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {listQ.data.files.map((rel) => (
                  <li key={rel} className="space-y-1">
                    <div className="inline-block bg-checker p-1 border rounded">
                      <img src={sceneAssetUrl(rel)} alt={rel} className="w-full image-render-pixel block" />
                    </div>
                    <div className="text-[11px] text-slate-600 truncate" title={rel}>{rel}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

