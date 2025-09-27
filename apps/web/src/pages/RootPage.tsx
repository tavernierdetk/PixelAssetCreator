import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import CharacterGallery from "@/components/Gallery";
import CharacterCreator from "@/components/CharacterCreator";

export default function RootPage() {
  return (
    <div className="space-y-10">
      {/* Top header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">PixelArt Asset Generator</h1>
        <div className="flex gap-2">
          <Link to="/settings"><Button type="button">Project Settings</Button></Link>
          <Link to="/tilesets">
            <Button type="button">
              Tilesets
            </Button>
          </Link>
        </div>
      </div>

      {/* Characters */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Characters</h2>
          <Link to="/tilesets" className="text-sm underline">Go to Tilesets →</Link>
        </div>
        <CharacterGallery />
        <div>
          <h3 className="text-lg font-medium mt-6 mb-3">Create a Character</h3>
          <CharacterCreator />
        </div>
      </section>
    </div>
  );
}
