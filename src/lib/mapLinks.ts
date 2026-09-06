import { withBasePath } from "./basePath";
import { EMPTY_FILTERS, type VillagesFilters } from "./types";

/**
 * Full-page map views are opened as plain URLs (new tab), not client-side
 * navigation -- a fresh tab has no app state, so the village id or
 * filters are round-tripped through the query string instead.
 */

const FILTER_KEYS: (keyof VillagesFilters)[] = ["district", "taluk", "village", "q", "sort"];

export function buildVillageMapUrl(villageId: number): string {
  const params = new URLSearchParams({ map: String(villageId) });
  return `${withBasePath("/")}?${params.toString()}`;
}

export function buildVillagesResultsMapUrl(filters: VillagesFilters): string {
  const params = new URLSearchParams({ mapResults: "1" });
  for (const key of FILTER_KEYS) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return `${withBasePath("/")}?${params.toString()}`;
}

export type Route =
  | { mode: "village-map"; villageId: number }
  | { mode: "results-map"; filters: VillagesFilters }
  | { mode: "dashboard" };

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);

  const mapParam = params.get("map");
  if (mapParam) {
    const villageId = Number(mapParam);
    if (Number.isFinite(villageId)) return { mode: "village-map", villageId };
  }

  if (params.get("mapResults")) {
    const filters: VillagesFilters = { ...EMPTY_FILTERS };
    for (const key of FILTER_KEYS) {
      const value = params.get(key);
      if (value) filters[key] = value;
    }
    return { mode: "results-map", filters };
  }

  return { mode: "dashboard" };
}
