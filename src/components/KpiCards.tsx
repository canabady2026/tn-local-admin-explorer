interface Kpi {
  label: string;
  value: string;
}

export function KpiCards({ kpis, loading }: { kpis: Kpi[]; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
            {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-slate-200" /> : kpi.value}
          </div>
        </div>
      ))}
    </div>
  );
}
