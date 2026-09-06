export interface VillageRow {
  village_id: number;
  dcode: number;
  tcode: number;
  vcode: string;
  district_en: string;
  district_ta: string;
  taluk_en: string;
  taluk_ta: string;
  village_en: string;
  village_ta: string;
}

export interface VillagesFilters {
  district: string;
  taluk: string;
  village: string; // substring match on village name, English or Tamil
  q: string; // free-text search across district/taluk/village, both languages
  sort: string; // "" | column | "-column"
}

export const EMPTY_FILTERS: VillagesFilters = {
  district: "",
  taluk: "",
  village: "",
  q: "",
  sort: "",
};

export interface Pagination {
  limit: number;
  offset: number;
  returned: number;
  total: number;
  next_offset: number | null;
}

export interface VillagesResult {
  data: VillageRow[];
  pagination: Pagination;
}

export interface District {
  id: number;
  dcode: number;
  name_en: string;
  name_ta: string;
  taluk_count: number;
  status: string;
}

export interface Taluk {
  id: number;
  dcode: number;
  tcode: number;
  name_en: string;
  name_ta: string;
  village_count: number;
  district_en: string;
}

export interface Habitation {
  habitation_name: string;
  village_name: string;
  panchayat_name: string;
  block_name: string;
  district_name: string;
  scCurrentPopulation: number;
  stCurrentPopulation: number;
  generalCurrentPopulation: number;
  status: string;
  as_on_date: string;
}

export interface NotablePerson {
  name_en: string;
  name_ta: string | null;
  speciality_type: string;
  link: string;
}

export interface VillageGeo {
  lat: number;
  lon: number;
  /** Which matched habitation this location came from, for attribution in the UI. */
  label: string;
  /** The village's real boundary, as one or more rings of [lat, lon] points -- only present when resolved via village_geo (a direct village-boundary match), not the habitation/Nominatim fallbacks. */
  polygon?: [number, number][][];
}

export interface VillageDetail {
  village: VillageRow;
  habitations: Habitation[];
  notablePeople: NotablePerson[];
  /** Approximated from a matched habitation's real coordinates, or null if none resolved. */
  geo: VillageGeo | null;
}

export interface FilteredSummary {
  villageCount: number;
  distinctTaluks: number;
  distinctDistricts: number;
}

export interface OverallStats {
  districts: number;
  taluks: number;
  villages: number;
  habitations: number;
}

export interface LocationSelection {
  district: string;
  taluk?: string;
}
