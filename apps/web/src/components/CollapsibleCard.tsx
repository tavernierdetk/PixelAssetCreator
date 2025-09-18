import { useState, type ReactNode } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CollapsibleCard({
  title,
  right,
  children,
  defaultOpen = true,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-2xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border hover:bg-slate-50"
          >
            <span className="font-medium">{title}</span>
            {/* chevron */}
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>

      <div className={`${open ? "block" : "hidden"}`}>
        {children}
      </div>
    </div>
  );
}
