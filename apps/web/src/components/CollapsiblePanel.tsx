import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CollapsiblePanel({
  title,
  defaultOpen = true,
  right,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => setOpen((v) => !v)} className="border bg-white hover:bg-slate-50 px-2 py-1 text-slate-700">
              {open ? "▾" : "▸"}
            </Button>
            <div className="font-medium">{title}</div>
          </div>
          {right ?? null}
        </div>
      </CardHeader>
      {open ? <CardContent className="space-y-3">{children}</CardContent> : null}
    </Card>
  );
}

