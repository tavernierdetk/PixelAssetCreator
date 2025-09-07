import { useQuery } from "@tanstack/react-query";
import { listAssets } from "@/lib/api";


export default function AssetsList({ slug }: { slug: string }) {
const { data, isLoading, error, refetch, isRefetching } = useQuery({
queryKey: ["assets", slug],
queryFn: () => listAssets(slug),
});


if (isLoading) return <p className="text-sm text-slate-600">Loading assets…</p>;
if (error) return <p className="text-sm text-red-600">{String(error)}</p>;


const files = data?.files ?? [];
return (
<div>
<div className="flex items-center justify-between mb-2">
<h3 className="font-medium">Assets ({files.length})</h3>
<button onClick={() => refetch()} className="text-xs underline">Refresh{isRefetching ? "…" : ""}</button>
</div>
{files.length === 0 ? (
<p className="text-sm text-slate-600">No files yet.</p>
) : (
<ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
{files.map((f) => (
<li key={f} className="rounded-xl border bg-white px-3 py-2 text-sm break-all">{f}</li>
))}
</ul>
)}
</div>
);
}