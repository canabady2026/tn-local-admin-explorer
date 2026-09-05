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
  VillageRow,
  VillagesFilters,
  VillagesResult,
} from "./types";

let dbPromise: Promise<Database> | null = null;

async function loadDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs({ locateFile: () => withBasePath("/sql.js/sql-wasm.wasm") });
      const res = await fetch(withBasePath("/data/tndb2021.db"));
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
  SELECT v.id AS village_id, v.vcode AS vcode,
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
     WHERE LOWER(village_name) = LOWER(?) AND LOWER(district_name) = LOWER(?)
     ORDER BY habitation_name`,
    [village.village_en, village.district_en]
  );

  return { village, habitations, notablePeople };
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
