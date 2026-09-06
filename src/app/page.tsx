"use client";

import { useState } from "react";
import useSWR from "swr";
import { DbStatusBadge } from "@/components/DbStatusBadge";
import { FilterPanel } from "@/components/FilterPanel";
import { FilterSummary } from "@/components/FilterSummary";
import { FontControls } from "@/components/FontControls";
import { FullPageResultsMap } from "@/components/FullPageResultsMap";
import { FullPageVillageMap } from "@/components/FullPageVillageMap";
import { HelpModal } from "@/components/HelpModal";
import { KpiCards } from "@/components/KpiCards";
import { Pagination } from "@/components/Pagination";
import { VillageDetailDrawer } from "@/components/VillageDetailDrawer";
import { VillagesTable } from "@/components/VillagesTable";
import { filtersForLocation } from "@/lib/filters";
import { buildVillagesResultsMapUrl, parseRoute } from "@/lib/mapLinks";
import { getOverallStats, queryVillages } from "@/lib/sqlite";
import { EMPTY_FILTERS, type VillagesFilters } from "@/lib/types";
import { useDebounced } from "@/lib/useDebounced";

const DEFAULT_LIMIT = 25;

function Dashboard() {
  const [filters, setFilters] = useState<VillagesFilters>(EMPTY_FILTERS);
  const debouncedFilters = useDebounced(filters, 350);

  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);

  // Reset to page 1 whenever the effective filter set (or page size)
  // changes, adjusted during render rather than in an effect -- see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const pageResetKey = `${JSON.stringify(debouncedFilters)}|${limit}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    if (offset !== 0) setOffset(0);
  }

  const [selectedVillage, setSelectedVillage] = useState<number | null>(null);

  const { data: villagesResult, isLoading: loading } = useSWR(["villages", pageResetKey, offset], () =>
    queryVillages(debouncedFilters, limit, offset)
  );
  const rows = villagesResult?.data ?? [];
  const pagination = villagesResult?.pagination ?? null;

  const { data: kpis, isLoading: kpisLoading } = useSWR("overall-stats", async () => {
    const stats = await getOverallStats();
    return [
      { label: "Districts", value: stats.districts.toLocaleString() },
      { label: "Taluks", value: stats.taluks.toLocaleString() },
      { label: "Villages", value: stats.villages.toLocaleString() },
      { label: "Habitations", value: stats.habitations.toLocaleString() },
    ];
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">TN Local Administration Explorer</h1>
          <p className="text-sm text-slate-500">
            Browse Tamil Nadu&apos;s district → taluk → village hierarchy, offline, entirely in your browser.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <FontControls />
            <HelpModal />
          </div>
          <DbStatusBadge />
        </div>
      </header>

      <KpiCards kpis={kpis ?? []} loading={kpisLoading} />

      <div className="flex justify-end">
        <a
          href={buildVillagesResultsMapUrl(filters)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 underline decoration-dotted hover:text-blue-800"
        >
          View matching villages on map ↗
        </a>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        <FilterPanel filters={filters} onChange={setFilters} />

        <div className="flex flex-col gap-3">
          <VillagesTable
            rows={rows}
            loading={loading}
            sort={filters.sort}
            onSortChange={(sort) => setFilters((f) => ({ ...f, sort }))}
            onRowClick={setSelectedVillage}
          />
          <Pagination pagination={pagination} limit={limit} onLimitChange={setLimit} onOffsetChange={setOffset} />
          <FilterSummary filters={debouncedFilters} />
        </div>
      </div>

      <footer className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-400">
        Source: Tamil Nadu local administration roster (districts, taluks, villages), 2021, plus a best-effort
        rural habitation coverage cross-reference. Interface modeled on the{" "}
        <a
          href="https://canabady2026.github.io/tnhighways-explorer/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted hover:text-slate-600"
        >
          TN Highways Explorer
        </a>
        .
      </footer>

      <VillageDetailDrawer
        villageId={selectedVillage}
        onClose={() => setSelectedVillage(null)}
        onNavigateToLocation={(location) => setFilters(filtersForLocation(location))}
      />
    </div>
  );
}

export default function Home() {
  // The full-page map view is opened as a plain URL (new tab), so the
  // route is whatever's in the query string on first load -- read via SWR
  // (client-only, never during the static prerender pass) rather than an
  // effect that would call setState directly.
  const { data: route } = useSWR("route", () => parseRoute(window.location.search));

  if (!route) return null;
  if (route.mode === "village-map") return <FullPageVillageMap villageId={route.villageId} />;
  if (route.mode === "results-map") return <FullPageResultsMap filters={route.filters} />;
  return <Dashboard />;
}
