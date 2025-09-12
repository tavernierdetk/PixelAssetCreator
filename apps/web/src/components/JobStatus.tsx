import React from "react";

type JobReturn =
  | { file?: string; outPath?: string; path?: string; url?: string; bytes?: number }
  | Record<string, unknown>
  | undefined;

type JobStatusData = {
  id: string;
  state:
    | "waiting"
    | "active"
    | "completed"
    | "failed"
    | "delayed"
    | "paused"
    | "stuck"
    | "gone"; // when the job is removed on completion and the API maps 404 -> 'gone'
  progress?: number;
  returnvalue?: JobReturn;
  failedReason?: string;
};

export function JobStatus({ job }: { job?: JobStatusData | null }) {
  if (!job) return null;

  const rv = (job.returnvalue ?? {}) as Partial<{
    file: string;
    outPath: string;
    path: string;
    url: string;
    bytes: number;
  }>;

  const fileLike = rv.file ?? rv.outPath ?? rv.path ?? rv.url;

  return (
    <div className="text-xs text-slate-600 space-y-1">
      <div>
        <span className="font-medium">Job:</span> {job.id} • <span className="font-medium">State:</span>{" "}
        <span
          className={
            job.state === "completed"
              ? "text-green-700"
              : job.state === "failed"
              ? "text-red-700"
              : job.state === "gone"
              ? "text-slate-500"
              : "text-amber-700"
          }
        >
          {job.state}
        </span>
        {typeof job.progress === "number" ? ` • ${job.progress}%` : null}
      </div>

      {job.state === "failed" && job.failedReason ? (
        <div className="text-red-700">Reason: {job.failedReason}</div>
      ) : null}

      {fileLike ? (
        <div className="truncate">
          <span className="font-medium">File:</span> {fileLike}
          {typeof rv.bytes === "number" ? ` • ${rv.bytes} bytes` : null}
        </div>
      ) : null}
    </div>
  );
}
