import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fileUrl } from "@/lib/api";

type Slot = "portrait" | "idle";


export function PortraitsPanel({
  slug,
  files,
  onGeneratePortrait,
  onGenerateIdle,
  onUpload,
  onRemove,
  hasDefinition,
  pending = {},
  cacheBust, // <-- new
}: {
  slug: string;
  files: string[];
  onGeneratePortrait: () => void;
  onGenerateIdle: () => void;
  onUpload: (slot: Slot, file: File) => void;
  onRemove: (slot: Slot) => void;
  hasDefinition: boolean;
  pending?: Partial<Record<Slot | "all", boolean>>;
  /** cache-busting token (e.g., a timestamp) to force fresh <img> loads */
  cacheBust?: number;
}) {

  const basenames = (files ?? []).map((f) => f.split("/").pop() || f);
  const fullPortrait = basenames.find((n) =>
    /^(high_res_portrait_|portrait_).*\.(png|webp|jpg|jpeg)$/i.test(n)
  );
  const idlePixel = basenames.find((n) =>
    /^(idle_static_|idle_pixelated_).*\.(png|webp|jpg|jpeg)$/i.test(n)
  );
  console.debug("[panel] files", { slug, files });
  console.debug("[panel] choose", { slug, fullPortrait, idlePixel, cacheBust });

  const canGenPortrait = hasDefinition;
  const canGenIdle = Boolean(fullPortrait);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="font-medium">Portraits</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SlotCard
            title="Full-art Portrait"
            slug={slug}
            fileName={fullPortrait || null}
            placeholder="No full-art portrait yet."
            canGenerate={canGenPortrait}
            isGenerating={!!pending.portrait}
            onGenerate={onGeneratePortrait}
            onUpload={(f) => onUpload("portrait", f)}
            onRemove={() => onRemove("portrait")}
            cacheBust={cacheBust}
          />
          <SlotCard
            title="Idle Pixel Image"
            slug={slug}
            fileName={idlePixel || null}
            placeholder="No idle pixel image yet."
            canGenerate={canGenIdle}
            isGenerating={!!pending.idle}
            onGenerate={onGenerateIdle}
            onUpload={(f) => onUpload("idle", f)}
            onRemove={() => onRemove("idle")}
            pixelated
            cacheBust={cacheBust}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SlotCard({
  title,
  slug,
  fileName,
  placeholder,
  canGenerate,
  isGenerating,
  onGenerate,
  onUpload,
  onRemove,
  pixelated = false,
  cacheBust,
}: {
  title: string;
  slug: string;
  fileName: string | null;
  placeholder: string;
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
  pixelated?: boolean;
  cacheBust?: number;
}) {
const src =
  fileName != null
    ? cacheBust
      ? `${fileUrl(slug, fileName, cacheBust)}`
      : fileUrl(slug, fileName)
    : null;

{src ? (
  <img
    className="max-h-[420px] object-contain"
    style={pixelated ? ({ imageRendering: "pixelated" } as any) : undefined}
    src={src}
    alt={title}
    draggable={false}
    onLoad={() => console.debug("[img] loaded", { title, src })}
    onError={() => console.error("[img] error", { title, src })}
  />
) : (
  <div className="text-sm text-slate-500 text-center">{placeholder}</div>
)}

  return (
    <div className="rounded-xl border p-3 bg-slate-50 min-h-64 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating}
            title={!canGenerate ? "Prerequisite not met" : undefined}
          >
            {isGenerating ? "Generating…" : "Generate"}
          </Button>

          <UploadButton onFile={(f) => onUpload(f)} disabled={isGenerating} />

          <Button
            type="button"
            className="bg-slate-100"
            disabled={!fileName || isGenerating}
            onClick={onRemove}
            title={!fileName ? "Nothing to remove" : undefined}
          >
            Remove
          </Button>
        </div>
      </div>

      <div className="relative flex-1 min-h-64 flex items-center justify-center bg-white rounded-lg border overflow-hidden">
        {src ? (
          <img
            className="max-h-[420px] object-contain"
            style={pixelated ? ({ imageRendering: "pixelated" } as any) : undefined}
            src={src}
            alt={title}
            draggable={false}
          />
        ) : (
          <div className="text-sm text-slate-500 text-center">{placeholder}</div>
        )}

        {isGenerating && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <div className="flex items-center gap-2 text-sm">
              <span className="animate-spin inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Generating…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadButton({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = "";
        }}
      />
      <span>
        <Button type="button" className="border" disabled={disabled}>
          Upload
        </Button>
      </span>
    </label>
  );
}
