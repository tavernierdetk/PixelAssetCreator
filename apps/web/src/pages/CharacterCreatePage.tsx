// apps/web/src/pages/CharacterCreatePage.tsx
import CharacterCreator from "@/components/CharacterCreator";
import { BackHeader } from "@/components/BackHeader";

export default function CharacterCreatePage() {
  return (
    <div className="space-y-6">
      <BackHeader title="Create Character" />
      <CharacterCreator />
    </div>
  );
}

