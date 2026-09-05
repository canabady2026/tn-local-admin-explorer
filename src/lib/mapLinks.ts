import { withBasePath } from "./basePath";

/**
 * The full-page map view is opened as a plain URL (new tab), not
 * client-side navigation -- a fresh tab has no app state, so the village
 * id is round-tripped through the query string instead.
 */

export function buildVillageMapUrl(villageId: number): string {
  const params = new URLSearchParams({ map: String(villageId) });
  return `${withBasePath("/")}?${params.toString()}`;
}

export type Route = { mode: "village-map"; villageId: number } | { mode: "dashboard" };

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const mapParam = params.get("map");
  if (mapParam) {
    const villageId = Number(mapParam);
    if (Number.isFinite(villageId)) return { mode: "village-map", villageId };
  }
  return { mode: "dashboard" };
}
