import { useQuery } from "@tanstack/react-query";
import { getJob } from "@/lib/api";


export default function JobStatus({ jobId }: { jobId: string }) {
const { data, isLoading, error } = useQuery({
queryKey: ["job", jobId],
queryFn: () => getJob(jobId),
refetchInterval: (q) => (q.state.data && q.state.data.state === "completed" ? false : 1000),
});


if (isLoading) return <p className="text-sm text-slate-600">Checking job…</p>;
if (error) return <p className="text-sm text-red-600">{String(error)}</p>;


return (
<div className="text-sm">
<div><span className="font-medium">State:</span> {data!.state}</div>
{typeof data!.progress === "number" && (
<div className="mt-1">Progress: {Math.round(data!.progress)}%</div>
)}
{data!.state === "completed" && data!.returnvalue?.file && (
<div className="mt-2 text-emerald-600">Output: {String(data!.returnvalue.file)}</div>
)}
</div>
);
}