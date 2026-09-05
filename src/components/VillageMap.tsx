"use client";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import "leaflet/dist/leaflet.css";
import { GeocodeUnavailableError, geocodeVillage } from "@/lib/osmVillage";

export function VillageMap({ villageEn, districtEn }: { villageEn: string; districtEn: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const {
    data: geo,
    isLoading,
    error,
  } = useSWR(["village-geocode", villageEn, districtEn] as const, () => geocodeVillage(villageEn, districtEn));

  // Imperative Leaflet lifecycle, kept separate from data fetching (SWR
  // above) so this effect never calls setState -- it only ever creates or
  // tears down the map instance held in mapRef.
  useEffect(() => {
    if (!geo || !containerRef.current) return;

    let disposed = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([geo.lat, geo.lon], 14);
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      L.marker([geo.lat, geo.lon]).addTo(map).bindPopup(geo.displayName);
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geo]);

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

  if (!geo) {
    return <p className="text-sm text-slate-500">This village isn&apos;t mapped as a distinct place in OpenStreetMap yet.</p>;
  }

  return <div ref={containerRef} className="h-56 w-full rounded-lg border border-slate-200" />;
}
