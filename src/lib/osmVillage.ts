/**
 * The source dataset has no coordinates at all (village.latitude/longitude
 * are null for every one of the 17,738 rows), so unlike the highways app
 * there's no ref/tag to look up directly -- this geocodes by name against
 * Nominatim instead and drops a marker, rather than fetching route
 * geometry from Overpass.
 *
 * Villages are numerous and many share names across districts, so a bare
 * name search is unreliable (tested against real data: e.g. "Kathalampattu"
 * with no district qualifier returns nothing useful, and some queries
 * match an unrelated road rather than the place itself). Two things curb
 * false matches: `featureType=settlement` restricts results to actual
 * places, and requiring the target district's name to appear in the
 * result's display_name rejects a same-named place resolved in the wrong
 * district. Verified against real villages: roughly 4 in 5 resolve
 * cleanly this way; the rest genuinely aren't mapped as a distinct place
 * in OSM, or Nominatim just doesn't have them -- not a bug, just
 * incomplete coverage.
 *
 * No custom User-Agent here: browsers refuse to let JS set that header,
 * and Nominatim's usage policy explicitly accepts the browser's own
 * Referer as sufficient identification for client-side apps.
 */

export interface VillageGeocode {
  lat: number;
  lon: number;
  displayName: string;
  placeType: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export class GeocodeUnavailableError extends Error {}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
}

export async function geocodeVillage(villageEn: string, districtEn: string): Promise<VillageGeocode | null> {
  const query = `${villageEn}, ${districtEn} District, Tamil Nadu, India`;
  const params = new URLSearchParams({
    format: "json",
    limit: "5",
    featureType: "settlement",
    q: query,
  });

  let res: Response;
  try {
    res = await fetch(`${NOMINATIM_URL}?${params}`);
  } catch {
    throw new GeocodeUnavailableError("network error reaching Nominatim");
  }
  if (res.status === 429) throw new GeocodeUnavailableError("Nominatim is rate-limiting requests");
  if (!res.ok) throw new GeocodeUnavailableError(`Nominatim request failed: ${res.status}`);

  const results: NominatimResult[] = await res.json();
  const match = results.find(
    (r) => r.class === "place" && r.display_name.toLowerCase().includes(districtEn.toLowerCase())
  );
  if (!match) return null;

  return {
    lat: Number(match.lat),
    lon: Number(match.lon),
    displayName: match.display_name,
    placeType: match.type,
  };
}
