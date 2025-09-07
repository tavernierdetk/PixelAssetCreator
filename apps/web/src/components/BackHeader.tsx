import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function BackHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => nav(-1)}>← Back</Button>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      {right ?? null}
    </div>
  );
}
