import CharacterGallery from "@/components/Gallery";
import CharacterCreator from "@/components/CharacterCreator";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function RootPage() {
  return (
    <div className="space-y-8">
      {/* Top header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">PixelArt Character Asset Generator</h1>
        <Link to="/settings">
          <Button type="button">Project Settings</Button>
        </Link>
      </div>

      {/* Block 1: Library / Gallery */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Library</h2>
        <CharacterGallery />
      </section>

      {/* Block 2: Creator (Chat + Form) */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Create a Character</h2>
        <CharacterCreator />
      </section>
    </div>
  );
}
