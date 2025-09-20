// apps/web/src/components/CollapsibleCard.tsx
import { useState, type ReactNode } from "react";

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
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <div className="border rounded-2xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border hover:bg-slate-50"
          >
            <span className="font-medium">{title}</span>
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

      {/* Content with consistent padding */}
      <div className={open ? "block" : "hidden"}>
        <div className="px-4 pb-4 md:px-5 md:pb-5">{children}</div>
      </div>
    </div>
  );
}