"use client";

import useSWR from "swr";
import { getFilteredSummary } from "@/lib/sqlite";
import type { VillagesFilters } from "@/lib/types";

function SummaryTile({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 tabular-nums">
        {value ?? <span className="inline-block h-6 w-16 animate-pulse rounded bg-slate-200" />}
      </div>
    </div>
  );
}

/** Aggregate totals for whatever's currently filtered -- distinct from the
 * header KPI cards, which always show whole-dataset totals. */
export function FilterSummary({ filters }: { filters: VillagesFilters }) {
  const { data, isLoading } = useSWR(["filtered-summary", JSON.stringify(filters)], () =>
    getFilteredSummary(filters)
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Summary for this filter</h2>
      <div className="grid grid-cols-3 gap-4">
        <SummaryTile label="Villages" value={isLoading || !data ? undefined : data.villageCount.toLocaleString()} />
        <SummaryTile
          label="Distinct taluks"
          value={isLoading || !data ? undefined : data.distinctTaluks.toLocaleString()}
        />
        <SummaryTile
          label="Distinct districts"
          value={isLoading || !data ? undefined : data.distinctDistricts.toLocaleString()}
        />
      </div>
    </div>
  );
}
