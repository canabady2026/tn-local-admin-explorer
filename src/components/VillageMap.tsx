"use client";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import "leaflet/dist/leaflet.css";
import { GeocodeUnavailableError, geocodeVillage } from "@/lib/osmVillage";
import type { VillageGeo } from "@/lib/types";

interface Props {
  villageEn: string;
  districtEn: string;
  /** Pre-resolved location from the habitation shapefile, if any -- skips the Nominatim lookup entirely when present. */
  geo: VillageGeo | null;
}

export function VillageMap({ villageEn, districtEn, geo }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  // Only fall back to geocoding by name when the shapefile-derived
  // location isn't available -- disabling the SWR key (null) when `geo`
  // is present means no Nominatim request is made at all in that case.
  const {
    data: fallback,
    isLoading,
    error,
  } = useSWR(!geo ? (["village-geocode", villageEn, districtEn] as const) : null, () =>
    geocodeVillage(villageEn, districtEn)
  );

  const resolved = useMemo(() => {
    if (geo) return { lat: geo.lat, lon: geo.lon, label: `Approximate location, from the habitation "${geo.label}"` };
    if (fallback) return { lat: fallback.lat, lon: fallback.lon, label: fallback.displayName };
    return null;
  }, [geo, fallback]);

  // Imperative Leaflet lifecycle, kept separate from data fetching (SWR
  // above) so this effect never calls setState -- it only ever creates or
  // tears down the map instance held in mapRef.
  useEffect(() => {
    if (!resolved || !containerRef.current) return;

    let disposed = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([resolved.lat, resolved.lon], 14);
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      L.marker([resolved.lat, resolved.lon]).addTo(map).bindPopup(resolved.label);
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [resolved]);

  if (geo) {
    // Resolved from the bundled shapefile -- no loading/error state to show.
    return <div ref={containerRef} className="h-56 w-full rounded-lg border border-slate-200" />;
  }

  if (isLoading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
        Looking up this village…
      </div>
    );
  }

  if (error) {
    const busy = error instanceof GeocodeUnavailableError;
    return (
      <p className="text-sm text-slate-500">
        {busy ? "OpenStreetMap's lookup service is busy right now — try again shortly." : "Could not load the map."}
      </p>
    );
  }

  if (!resolved) {
    return (
      <p className="text-sm text-slate-500">
        No location data found for this village, in the bundled habitation data or OpenStreetMap.
      </p>
    );
  }

  return <div ref={containerRef} className="h-56 w-full rounded-lg border border-slate-200" />;
}
