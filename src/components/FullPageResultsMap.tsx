"use client";

import type { FeatureGroup, Layer, Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import "leaflet/dist/leaflet.css";
import { withBasePath } from "@/lib/basePath";
import { getVillagesForMap, RESULTS_MAP_LIMIT } from "@/lib/sqlite";
import type { VillagesFilters } from "@/lib/types";

export function FullPageResultsMap({ filters }: { filters: VillagesFilters }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const { data, isLoading } = useSWR(["villages-map", JSON.stringify(filters)] as const, () =>
    getVillagesForMap(filters)
  );

  // Imperative Leaflet lifecycle, kept separate from data fetching (SWR
  // above) so this effect never calls setState -- it only ever creates or
  // tears down the map instance held in mapRef.
  useEffect(() => {
    if (!data || data.points.length === 0 || !containerRef.current) return;

    let disposed = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: true });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      const layers: Layer[] = data.points.map((p) =>
        p.polygon
          ? L.polygon(p.polygon, { color: "#1d4ed8", weight: 2, fillOpacity: 0.08 }).bindTooltip(p.village_en)
          : L.circleMarker([p.lat, p.lon], {
              radius: 5,
              color: "#1d4ed8",
              fillColor: "#1d4ed8",
              fillOpacity: 0.8,
            }).bindTooltip(p.village_en)
      );

      const group: FeatureGroup = L.featureGroup(layers).addTo(map);
      map.fitBounds(group.getBounds(), { padding: [24, 24] });
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [data]);

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <a
          href={withBasePath("/")}
          className="text-sm text-slate-500 underline decoration-dotted hover:text-slate-700"
        >
          ← Back to explorer
        </a>
        <h1 className="text-sm font-semibold text-slate-900">
          {isLoading
            ? "Finding matching villages…"
            : `${data?.points.length ?? 0} of ${data?.totalMatched.toLocaleString() ?? 0} matching villages shown`}
        </h1>
        {!isLoading && data && data.totalMatched > RESULTS_MAP_LIMIT && (
          <span className="text-xs text-slate-500">
            (only the first {RESULTS_MAP_LIMIT} matching villages are considered -- refine filters to see the rest)
          </span>
        )}
        {!isLoading && data && data.totalMatched <= RESULTS_MAP_LIMIT && data.points.length < data.totalMatched && (
          <span className="text-xs text-slate-500">
            ({data.totalMatched - data.points.length} matching village
            {data.totalMatched - data.points.length === 1 ? "" : "s"} have no resolvable location)
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <span className="inline-block h-2.5 w-4 rounded-sm border-2 border-blue-700 bg-blue-700/10" />
          Village boundary / location
        </div>
      </header>

      <div className="relative flex-1 p-3">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>
        )}
        {!isLoading && data && data.points.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            No mappable location found for any matching village -- try narrowing the filters.
          </p>
        )}
        {data && data.points.length > 0 && (
          <div ref={containerRef} className="h-full w-full rounded-lg border border-slate-200" />
        )}
      </div>
    </div>
  );
}
