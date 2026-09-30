import { useApi } from "../lib/useApi";
import { Card } from "./ui";

interface Speed {
  dbRoundTripMs: number;
  server: { code: string; name: string } | null;
  database: { code: string; name: string } | null;
  recommendedServerRegion: { code: string; name: string } | null;
  mismatch: boolean;
}

// Settings → Server speed: how far the app's server is from its database.
// Every save or page load makes several database trips, so this is the
// single biggest factor in how fast the app feels.
export default function ServerSpeed() {
  const { data, loading, refetch, refreshing } = useApi<Speed>("/speed");
  const ms = data?.dbRoundTripMs ?? 0;
  const verdict = ms < 30 ? { label: "Fast", cls: "bg-emerald-100 text-emerald-700" } : ms < 100 ? { label: "OK", cls: "bg-amber-100 text-amber-700" } : { label: "Slow", cls: "bg-rose-100 text-rose-700" };

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-semibold text-slate-800">Server speed</h3>
        <button onClick={() => refetch()} className="text-xs font-medium text-brand-600" disabled={refreshing}>{refreshing ? "Checking…" : "Check again"}</button>
      </div>
      <p className="text-sm text-slate-400 mb-4">How long one trip between the app's server and its database takes. A save or page load makes several.</p>
      {loading || !data ? (
        <p className="text-sm text-slate-400">Checking…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Database trip</p>
              <p className="text-lg font-bold text-slate-800">{ms} ms <span className={`ml-1 align-middle rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdict.cls}`}>{verdict.label}</span></p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Server runs in</p>
              <p className="text-lg font-bold text-slate-800">{data.server ? `${data.server.name} (${data.server.code})` : "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Database is in</p>
              <p className="text-lg font-bold text-slate-800">{data.database ? `${data.database.name} (${data.database.code})` : "—"}</p>
            </div>
          </div>
          {data.mismatch && data.recommendedServerRegion ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">The server and the database are far apart — this is what makes saving slow.</p>
              <p className="mt-1">
                In <b>Vercel</b>, open this project → <b>Settings → Functions → Function Region</b>, choose <b>{data.recommendedServerRegion.name} ({data.recommendedServerRegion.code})</b>, save, then <b>Redeploy</b>. Every save and page load will then be several times faster.
              </p>
            </div>
          ) : ms < 30 ? (
            <p className="mt-4 text-sm text-emerald-700">The server and database are close together — good.</p>
          ) : null}
        </>
      )}
    </Card>
  );
}
