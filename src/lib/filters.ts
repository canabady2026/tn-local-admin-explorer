import { EMPTY_FILTERS, type LocationSelection, type VillagesFilters } from "./types";

export function hasActiveFilters(f: VillagesFilters): boolean {
  return Object.entries(f).some(([key, value]) => key !== "sort" && value !== "");
}

/** Replaces all filters with just this location -- used when clicking a
 * district/taluk badge to jump the main list to that place. */
export function filtersForLocation(location: LocationSelection): VillagesFilters {
  return {
    ...EMPTY_FILTERS,
    district: location.district,
    taluk: location.taluk ?? "",
  };
}
