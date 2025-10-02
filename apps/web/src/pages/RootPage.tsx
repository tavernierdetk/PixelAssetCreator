import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listCharacters, listTilesets, listSceneAssets } from "@/lib/api";

export default function RootPage() {
  const charsQ = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const tilesetsQ = useQuery({ queryKey: ["tilesets"], queryFn: listTilesets });
  const staticQ = useQuery({ queryKey: ["staticAssets"], queryFn: () => listSceneAssets().catch(() => ({ ok: true, files: [] })) });

  return (
    <div className="space-y-10">
      {/* Top header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">PixelArt Asset Generator</h1>
        <div className="flex gap-2">
          <Link to="/settings"><Button type="button">Project Settings</Button></Link>
          <Link to="/scenes"><Button type="button">Scenes</Button></Link>
          <Link to="/tilesets">
            <Button type="button">
              Tilesets
            </Button>
          </Link>
          <Link to="/characters/new"><Button type="button">New Character</Button></Link>
          <Link to="/tilesets#create-tileset"><Button type="button">New Tileset</Button></Link>
        </div>
      </div>

      {/* Dashboard summary */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border rounded p-4 bg-white">
          <div className="text-sm text-slate-600">Characters</div>
          <div className="text-3xl font-semibold">
            {charsQ.isLoading ? "—" : (charsQ.data?.slugs?.length ?? 0)}
          </div>
          <div className="mt-3">
            <Link to="/characters/new"><Button>Create Character</Button></Link>
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-sm text-slate-600">Tilesets</div>
          <div className="text-3xl font-semibold">
            {tilesetsQ.isLoading ? "—" : (tilesetsQ.data?.slugs?.length ?? 0)}
          </div>
          <div className="mt-3">
            <Link to="/tilesets#create-tileset"><Button>Create Tileset</Button></Link>
          </div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-sm text-slate-600">Static Assets</div>
          <div className="text-3xl font-semibold">
            {staticQ.isLoading ? "—" : (staticQ.data?.files?.length ?? 0)}
          </div>
          <div className="mt-3">
            <Link to="/scenes"><Button>Open Scenes</Button></Link>
          </div>
        </div>
      </section>

      {/* (Character library removed from root; see /characters/new to create) */}
    </div>
  );
}
