// apps/web/src/components/character/PortraitsPanel.tsx
import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { fileUrl } from "@/lib/api";

export function PortraitsPanel({
  slug,
  files,
  hasDefinition,
  pending,
  onGeneratePortrait,
  onUploadPortrait,
  onRemovePortrait,
  cacheBust,
}: {
  slug: string;
  files: string[];
  hasDefinition: boolean;
  pending: { portrait?: boolean };
  onGeneratePortrait: () => Promise<void> | void;
  onUploadPortrait: (file: File) => Promise<void> | void;
  onRemovePortrait: () => Promise<void> | void;
  cacheBust: number;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const portraitName = useMemo(
    () => files.find((f) => /^high_res_portrait_.*\.(png|jpg|jpeg|webp)$/i.test(f)) || null,
    [files]
  );

  const portraitSrc = useMemo(
    () => (portraitName ? fileUrl(slug, portraitName, cacheBust) : null),
    [portraitName, slug, cacheBust]
  );

  const isGen = Boolean(pending.portrait);
  const canRemove = Boolean(portraitSrc) && !isGen;

  return (
    <div className="w-full border rounded-2xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="font-medium">Portrait (Full Art)</div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => onGeneratePortrait()} disabled={!hasDefinition || isGen}>
            {isGen ? "Generating…" : "Generate Portrait"}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadPortrait(f);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isGen}>
            Upload Portrait
          </Button>

          <Button type="button" onClick={() => onRemovePortrait()} disabled={!canRemove}>
            Remove Portrait
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4 md:px-5 md:pb-5">
        {isGen ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 animate-pulse flex items-center justify-center text-sm text-slate-600 min-h-[200px]">
            Generating portrait…
          </div>
        ) : !portraitSrc ? (
          <p className="text-sm text-slate-600">No portrait yet.</p>
        ) : (
          <div className="w-full rounded-xl border border-slate-200 bg-white p-2 flex items-center justify-center">
            <img
              src={portraitSrc}
              alt={`Portrait for ${slug}`}
              className="max-w-full h-auto object-contain rounded-lg"
              style={{ display: "block" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}