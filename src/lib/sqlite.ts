import initSqlJs, { type Database, type SqlValue } from "sql.js";
import { withBasePath } from "./basePath";
import type {
  District,
  FilteredSummary,
  Habitation,
  NotablePerson,
  OverallStats,
  Taluk,
  VillageDetail,
  VillageGeo,
  VillageRow,
  VillagesFilters,
  VillagesResult,
} from "./types";

/**
 * habitation.district_name spellings that don't exactly match
 * district.name_en (found by diffing all 31 distinct habitation.district_name
 * values against district.name_en -- everything else matches exactly).
 * Applying this closes real gaps in the village<->habitation join, not
 * just the geo lookup below: verified 3,326 -> 4,287 villages (+29%) get a
 * habitation match once it's applied.
 */
const DISTRICT_ALIASES: Record<string, string> = {
  kanchipuram: "Kancheepuram",
  nilgiris: "The Nilgiris",
  thoothukudi: "Thoothukkudi",
  tiruvallur: "Thiruvallur",
  tiruvarur: "Thiruvarur",
  villupuram: "Viluppuram",
};

const DISTRICT_ALIAS_CASE_SQL =
  "CASE LOWER(district_name) " +
  Object.entries(DISTRICT_ALIASES)
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
    .join(" ") +
  " ELSE district_name END";

/**
 * The habitation geo dataset (Habitation_Tamilnadu shapefile) predates
 * Tamil Nadu's 2019/2020 district splits, so these six newer districts
 * have no habitation_geo.district_en of their own -- their habitations
 * are filed under the pre-split parent district instead.
 */
const PARENT_DISTRICT: Record<string, string> = {
  Chengalpattu: "Kancheepuram",
  Kallakurichi: "Viluppuram",
  Ranipet: "Vellore",
  Thirupathur: "Vellore",
  Tenkasi: "Tirunelveli",
  Mayiladuturai: "Nagapattinam",
};

let dbPromise: Promise<Database> | null = null;

async function loadDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs({ locateFile: () => withBasePath("/sql.js/sql-wasm.wasm") });
      // The version query param is a content hash computed at build time
      // (next.config.ts) -- it changes whenever the db's content changes,
      // which busts any HTTP/browser cache still holding a previous
      // deploy's file under this same stable filename. Without it, a
      // browser that loaded the page shortly before a deploy could keep
      // querying a stale db against a JS bundle built for the new schema.
      const dbUrl = withBasePath(`/data/tndb2021.db?v=${process.env.NEXT_PUBLIC_DB_VERSION || "0"}`);
      const res = await fetch(dbUrl);
      if (!res.ok) throw new Error(`failed to fetch bundled database: ${res.status}`);
      const buf = await res.arrayBuffer();
      return new SQL.Database(new Uint8Array(buf));
    })();
  }
  return dbPromise;
}

/** Resolves once the offline database is loaded and ready to query. */
export async function isDbReady(): Promise<true> {
  await loadDb();
  return true;
}

function rowsOf<T>(db: Database, sql: string, params: SqlValue[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: T[] = [];
  while (stmt.step()) out.push(stmt.getAsObject() as T);
  stmt.free();
  return out;
}

const VILLAGE_SELECT = `
  SELECT v.id AS village_id, v.dcode AS dcode, v.tcode AS tcode, v.vcode AS vcode,
         d.name_en AS district_en, d.name_ta AS district_ta,
         t.name_en AS taluk_en, t.name_ta AS taluk_ta,
         v.name_en AS village_en, v.name_ta AS village_ta
  FROM village v
  JOIN taluk t ON t.dcode = v.dcode AND t.tcode = v.tcode
  JOIN district d ON d.dcode = v.dcode
`;

const VILLAGE_JOIN = `
  FROM village v
  JOIN taluk t ON t.dcode = v.dcode AND t.tcode = v.tcode
  JOIN district d ON d.dcode = v.dcode
`;

function buildWhere(filters: VillagesFilters): { sql: string; params: SqlValue[] } {
  const clauses: string[] = [];
  const params: SqlValue[] = [];

  if (filters.district) {
    clauses.push("LOWER(d.name_en) = LOWER(?)");
    params.push(filters.district);
  }
  if (filters.taluk) {
    clauses.push("LOWER(t.name_en) = LOWER(?)");
    params.push(filters.taluk);
  }
  if (filters.village) {
    clauses.push("(v.name_en LIKE ? COLLATE NOCASE OR v.name_ta LIKE ?)");
    params.push(`%${filters.village}%`, `%${filters.village}%`);
  }
  if (filters.q) {
    clauses.push(
      `(d.name_en LIKE ? COLLATE NOCASE OR d.name_ta LIKE ?
     OR t.name_en LIKE ? COLLATE NOCASE OR t.name_ta LIKE ?
     OR v.name_en LIKE ? COLLATE NOCASE OR v.name_ta LIKE ?)`
    );
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like, like);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const SORT_EXPR: Record<string, string> = {
  district_en: "d.name_en",
  district_ta: "d.name_ta",
  taluk_en: "t.name_en",
  taluk_ta: "t.name_ta",
  village_en: "v.name_en",
  village_ta: "v.name_ta",
};

function sortExpr(sort?: string): string {
  const fallback = "d.name_en, t.name_en, v.name_en";
  if (!sort) return fallback;
  const desc = sort.startsWith("-");
  const col = desc ? sort.slice(1) : sort;
  const expr = SORT_EXPR[col];
  if (!expr) return fallback;
  return `${expr} ${desc ? "DESC" : "ASC"}`;
}

export async function queryVillages(filters: VillagesFilters, limit: number, offset: number): Promise<VillagesResult> {
  const db = await loadDb();
  const { sql: whereSql, params } = buildWhere(filters);

  const [{ values }] = db.exec(`SELECT COUNT(*) ${VILLAGE_JOIN} ${whereSql}`, params);
  const total = Number(values[0][0]);

  const data = rowsOf<VillageRow>(
    db,
    `${VILLAGE_SELECT} ${whereSql} ORDER BY ${sortExpr(filters.sort)} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    data,
    pagination: {
      limit,
      offset,
      returned: data.length,
      total,
      next_offset: offset + limit < total ? offset + limit : null,
    },
  };
}

export async function getVillageDetail(villageId: number): Promise<VillageDetail | null> {
  const db = await loadDb();
  const [village] = rowsOf<VillageRow>(db, `${VILLAGE_SELECT} WHERE v.id = ?`, [villageId]);
  if (!village) return null;

  const notablePeople = rowsOf<NotablePerson>(
    db,
    "SELECT name_en, name_ta, speciality_type, link FROM speciality WHERE village_id = ?",
    [villageId]
  );

  // habitation has no foreign key to village -- it's a separate rural
  // drinking-water-coverage dataset keyed by free-text names, so this is a
  // best-effort match, not a guaranteed one. Some villages will show none
  // even if the source data has related habitation records under a
  // slightly different spelling or at panchayat rather than village
  // granularity.
  const habitations = rowsOf<Habitation>(
    db,
    `SELECT habitation_name, village_name, panchayat_name, block_name, district_name,
            scCurrentPopulation, stCurrentPopulation, generalCurrentPopulation, status, as_on_date
     FROM habitation
     WHERE LOWER(village_name) = LOWER(?) AND LOWER(${DISTRICT_ALIAS_CASE_SQL}) = LOWER(?)
     ORDER BY habitation_name`,
    [village.village_en, village.district_en]
  );

  const geo = findVillageGeoDirect(db, village) ?? findHabitationGeo(db, habitations, village.district_en);

  return { village, habitations, notablePeople, geo };
}

/**
 * A village's real polygon centroid from the revenue_village.kml shapefile
 * (loaded into village_geo by scripts/build_bundled_db.py), matched
 * directly by (dcode, tcode, vcode) -- verified these match our own
 * village table's codes exactly. This is the highest-confidence source:
 * a real boundary centroid for this exact village, not a name-based
 * guess. Verified coverage: 96.2% of all villages (17,056/17,738). The
 * residual gap is mostly urbanized ex-villages the shapefile files under
 * a Corporation/Municipality boundary instead of a Village polygon.
 */
function findVillageGeoDirect(db: Database, village: VillageRow): VillageGeo | null {
  const [hit] = rowsOf<{ lat: number; lon: number; vill_name: string }>(
    db,
    "SELECT lat, lon, vill_name FROM village_geo WHERE dcode = ? AND tcode = ? AND vcode = ?",
    [village.dcode, village.tcode, village.vcode]
  );
  return hit ? { lat: hit.lat, lon: hit.lon, label: `${village.village_en} (village boundary centroid)` } : null;
}

/**
 * Falls back to approximating a village's location from a matched
 * habitation's real coordinates (Habitation_Tamilnadu shapefile), tried in
 * order until one resolves -- district_en must match (via the pre-split
 * parent for the six newer districts) to reject a same-named habitation
 * elsewhere in Tamil Nadu, since habitation names are not unique
 * statewide. Returns null if no habitation matched to this village also
 * has shapefile coordinates in the right district; the caller falls back
 * to geocoding by name instead.
 */
function findHabitationGeo(db: Database, habitations: Habitation[], districtEn: string): VillageGeo | null {
  const targetDistrict = PARENT_DISTRICT[districtEn] ?? districtEn;
  for (const hab of habitations) {
    const [hit] = rowsOf<{ lat: number; lon: number; hab_name: string }>(
      db,
      "SELECT lat, lon, hab_name FROM habitation_geo WHERE LOWER(hab_name) = LOWER(?) AND district_en = ? LIMIT 1",
      [hab.habitation_name, targetDistrict]
    );
    if (hit) return { lat: hit.lat, lon: hit.lon, label: `Approximate location, from the habitation "${hit.hab_name}"` };
  }
  return null;
}

export async function getDistricts(): Promise<District[]> {
  const db = await loadDb();
  return rowsOf<District>(
    db,
    "SELECT id, dcode, name_en, name_ta, taluk_count, status FROM district ORDER BY name_en"
  );
}

export async function getTaluks(districtName?: string): Promise<Taluk[]> {
  const db = await loadDb();
  const where = districtName ? "WHERE LOWER(d.name_en) = LOWER(?)" : "";
  const params = districtName ? [districtName] : [];
  return rowsOf<Taluk>(
    db,
    `SELECT t.id, t.dcode, t.tcode, t.name_en, t.name_ta, t.village_count, d.name_en AS district_en
     FROM taluk t JOIN district d ON d.dcode = t.dcode
     ${where} ORDER BY d.name_en, t.name_en`,
    params
  );
}

export async function getFilteredSummary(filters: VillagesFilters): Promise<FilteredSummary> {
  const db = await loadDb();
  const { sql: whereSql, params } = buildWhere(filters);
  const [row] = rowsOf<{ village_count: number; distinct_taluks: number; distinct_districts: number }>(
    db,
    `SELECT COUNT(*) AS village_count,
            COUNT(DISTINCT t.id) AS distinct_taluks,
            COUNT(DISTINCT d.id) AS distinct_districts
     ${VILLAGE_JOIN} ${whereSql}`,
    params
  );
  return {
    villageCount: row.village_count,
    distinctTaluks: row.distinct_taluks,
    distinctDistricts: row.distinct_districts,
  };
}

export async function getOverallStats(): Promise<OverallStats> {
  const db = await loadDb();
  const [row] = rowsOf<OverallStats>(
    db,
    `SELECT (SELECT COUNT(*) FROM district) AS districts,
            (SELECT COUNT(*) FROM taluk) AS taluks,
            (SELECT COUNT(*) FROM village) AS villages,
            (SELECT COUNT(*) FROM habitation) AS habitations`
  );
  return row;
}
