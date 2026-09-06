"use client";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import "leaflet/dist/leaflet.css";
import { withBasePath } from "@/lib/basePath";
import { GeocodeUnavailableError, geocodeVillage } from "@/lib/osmVillage";
import type { VillageGeo } from "@/lib/types";

let iconsConfigured = false;

interface Props {
  villageEn: string;
  villageTa: string;
  talukEn: string;
  districtEn: string;
  /** Pre-resolved location from the habitation shapefile, if any -- skips the Nominatim lookup entirely when present. */
  geo: VillageGeo | null;
  fullHeight?: boolean;
}

export function VillageMap({ villageEn, villageTa, talukEn, districtEn, geo, fullHeight = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const heightClass = fullHeight ? "h-full" : "h-56";

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
    if (geo) return { lat: geo.lat, lon: geo.lon, description: geo.label, polygon: geo.polygon };
    if (fallback)
      return { lat: fallback.lat, lon: fallback.lon, description: fallback.displayName, polygon: undefined };
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

      // Leaflet's default marker icon is referenced via relative URLs
      // baked into its own JS at build time, which don't resolve once
      // bundled by webpack -- the icon (and its shadow) silently fail to
      // load. Pointing it at our own copies (public/leaflet/, alongside
      // the wasm/db assets) fixes it; only needs doing once per session.
      if (!iconsConfigured) {
        L.Icon.Default.mergeOptions({
          iconUrl: withBasePath("/leaflet/marker-icon.png"),
          iconRetinaUrl: withBasePath("/leaflet/marker-icon-2x.png"),
          shadowUrl: withBasePath("/leaflet/marker-shadow.png"),
        });
        iconsConfigured = true;
      }

      const map = L.map(containerRef.current, { scrollWheelZoom: fullHeight }).setView(
        [resolved.lat, resolved.lon],
        14
      );
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      // Leaflet's popup content is rendered as HTML, not plain text, so
      // every dynamic value has to be escaped -- otherwise a name
      // containing "&"/"<"/">" would break the markup.
      const escapeHtml = (text: string) =>
        text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const popupHtml = `
        <div style="font-size:1.2em;font-weight:700;line-height:1.3;">${escapeHtml(villageTa)}</div>
        <div style="font-size:0.95em;">${escapeHtml(villageEn)}</div>
        <div style="font-size:0.8em;color:#64748b;margin-top:2px;">${escapeHtml(talukEn)}, ${escapeHtml(districtEn)}</div>
        <div style="font-size:0.75em;color:#94a3b8;margin-top:2px;">${escapeHtml(resolved.description)}</div>
      `;

      L.marker([resolved.lat, resolved.lon]).addTo(map).bindPopup(popupHtml);

      // The village's real boundary, when resolved via village_geo --
      // habitation/Nominatim fallbacks only ever give a point, no polygon.
      if (resolved.polygon && resolved.polygon.length > 0) {
        const polygon = L.polygon(resolved.polygon, {
          color: "#1d4ed8",
          weight: 4,
          fillOpacity: 0.08,
        }).addTo(map);
        map.fitBounds(polygon.getBounds(), { padding: [16, 16] });
      }
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [resolved, fullHeight, villageEn, villageTa, talukEn, districtEn]);

  if (geo) {
    // Resolved from the bundled shapefile -- no loading/error state to show.
    return <div ref={containerRef} className={`${heightClass} w-full rounded-lg border border-slate-200`} />;
  }

  if (isLoading) {
    return (
      <div
        className={`flex ${heightClass} items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400`}
      >
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
        No location data found for this village, in the bundled village/habitation boundaries or OpenStreetMap.
      </p>
    );
  }

  return <div ref={containerRef} className={`${heightClass} w-full rounded-lg border border-slate-200`} />;
}
