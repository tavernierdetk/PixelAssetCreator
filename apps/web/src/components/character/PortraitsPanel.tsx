import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  const portraitName = useMemo(() => {
    // server lists filenames; pick the high-res portrait
    return files.find((f) => /^high_res_portrait_.*\.(png|jpg|jpeg|webp)$/i.test(f)) || null;
  }, [files]);

  const portraitSrc = useMemo(
    () => (portraitName ? fileUrl(slug, portraitName, cacheBust) : null),
    [portraitName, slug, cacheBust]
  );

  const isGen = Boolean(pending.portrait);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="font-medium">Portrait (Full Art)</div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => onGeneratePortrait()}
              disabled={!hasDefinition || isGen}
            >
              {isGen ? "Generating…" : "Generate Portrait"}
            </Button>

            <label className="inline-flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadPortrait(f);
                  e.currentTarget.value = "";
                }}
              />
              <span className="px-3 py-2 rounded-xl border border-slate-300 text-sm cursor-pointer">
                Upload Portrait
              </span>
            </label>

            <Button
              type="button"
              onClick={() => onRemovePortrait()}
              disabled={!portraitSrc || isGen}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Remove Portrait
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isGen ? (
          <div className="h-64 rounded-xl border border-slate-200 bg-slate-50 animate-pulse flex items-center justify-center text-sm text-slate-600">
            Generating portrait…
          </div>
        ) : !portraitSrc ? (
          <p className="text-sm text-slate-600">No portrait yet.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portraitSrc}
            alt={`Portrait for ${slug}`}
            className="max-h-[420px] rounded-xl border border-slate-200"
          />
        )}
      </CardContent>
    </Card>
  );
}
