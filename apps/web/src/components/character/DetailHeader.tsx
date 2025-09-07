import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function DetailHeader({ slug }: { slug: string }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => nav(-1)}>← Back</Button>
        <h1 className="text-xl font-semibold">Edit Character</h1>
      </div>
      <div className="text-sm text-slate-600">
        <span className="font-medium">Slug:</span> <code>{slug}</code>
      </div>
    </div>
  );
}
