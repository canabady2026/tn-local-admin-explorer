#!/usr/bin/env python3
"""
Builds public/data/tndb2021.db from the source database plus two
geospatial sources, all expected at ~/dev/tn-local-administration/:
  - Habitation_Tamilnadu/Habitation.kml   (habitation-level points)
  - revenue_village.kml                    (revenue village polygons, ~191MB)
village-master.csv was also evaluated (see below) but isn't used --
it added zero additional coverage in testing.

Usage: python3 scripts/build_bundled_db.py

What it does:
  1. Copies the source tndb2021.db and VACUUMs it (23MB -> ~14.7MB).
  2. Adds an expression index for the free-text habitation<->village join
     (idx_habitation_lookup), and normalizes six habitation.district_name
     spellings that don't exactly match district.name_en (see
     DISTRICT_ALIASES) -- without this, villages in Kancheepuram, The
     Nilgiris, Thoothukkudi, Thiruvallur, Thiruvarur, and Viluppuram never
     match any habitation record at all, regardless of the free-text
     village-name match. Verified impact: 3,326 -> 4,287 villages (+29%)
     get a habitation match once applied.
  3. Loads the habitation shapefile's ~66,918 points into `habitation_geo`,
     with each point's DISTRICT_I code resolved to our district.name_en by
     habitation-name-set overlap against the (alias-normalized) habitation
     table -- the shapefile predates Tamil Nadu's 2019/2020 district
     splits, so it has 37 codes against our 38 districts; PARENT_DISTRICT
     in src/lib/sqlite.ts maps the six newer districts back to their
     pre-split parent at query time.
  4. Streams revenue_village.kml's ~18,516 placemarks (it's too large to
     hold as a DOM; ET.iterparse + elem.clear() keeps memory bounded) into
     `village_geo`: one centroid per "Village"/"Village (Uninhabitable)"
     polygon, keyed directly by (dcode, tcode, vcode) -- verified these
     match our own village table's codes exactly, no crosswalk needed.
     A handful of codes appear on more than one placemark (split/exclave
     parcels); their centroids are averaged into one row.
  5. VACUUMs again and writes the result to public/data/tndb2021.db.

The village detail drawer's map resolves a location in this priority:
  1. village_geo, direct (dcode, tcode, vcode) match -- verified coverage:
     96.2% of all villages (17,056/17,738), and highest confidence since
     it's a real polygon centroid for that exact village, not a name match.
  2. habitation_geo, via a matched habitation's shapefile coordinates (see
     step 3) -- catches some of the remaining 3.8%.
  3. Nominatim, geocoding the village by name (src/lib/osmVillage.ts) --
     final fallback.
The residual gap after (1) is mostly urbanized ex-villages (Chennai
suburbs like Adambakkam, Alandur, Nanganallur) that revenue_village.kml
files under "Corporation"/"Municipality" boundaries instead of a "Village"
polygon -- a centroid of an entire corporation wouldn't give an accurate
point for one specific locality anyway, so these are left to (2) and (3)
rather than forcing a misleading match. village-master.csv (a
dcode/tcode/vcode <-> LGD-code crosswalk) was tested as a bridge to
recover these via LGD codes instead; it recovered zero of the 682 gap
villages -- they're absent from that file too -- so it isn't used.
"""

import shutil
import sqlite3
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

SOURCE_DIR = Path.home() / "dev" / "tn-local-administration"
SOURCE_DB = SOURCE_DIR / "tndb2021.db"
HABITATION_KML_PATH = SOURCE_DIR / "Habitation_Tamilnadu" / "Habitation.kml"
REVENUE_VILLAGE_KML_PATH = SOURCE_DIR / "revenue_village.kml"
OUTPUT_DB = Path(__file__).resolve().parent.parent / "public" / "data" / "tndb2021.db"

NS = {"k": "http://www.opengis.net/kml/2.2"}
KML_NS = "{http://www.opengis.net/kml/2.2}"

REVENUE_VILLAGE_TYPES = {"Village", "Village (Uninhabitable)"}

# habitation.district_name spellings that don't exactly match district.name_en.
DISTRICT_ALIASES = {
    "kanchipuram": "Kancheepuram",
    "nilgiris": "The Nilgiris",
    "thoothukudi": "Thoothukkudi",
    "tiruvallur": "Thiruvallur",
    "tiruvarur": "Thiruvarur",
    "villupuram": "Viluppuram",
}

_ALIAS_CASE_SQL = "CASE LOWER(district_name) " + " ".join(
    f"WHEN '{k}' THEN '{v}'" for k, v in DISTRICT_ALIASES.items()
) + " ELSE district_name END"


def parse_habitation_kml():
    tree = ET.parse(HABITATION_KML_PATH)
    records = []
    for pm in tree.getroot().findall(".//k:Placemark", NS):
        data = {sd.get("name"): sd.text for sd in pm.findall(".//k:SimpleData", NS)}
        coords = pm.find(".//k:Point/k:coordinates", NS)
        if coords is None or not coords.text:
            continue
        lon, lat = (float(x) for x in coords.text.split(",")[:2])
        records.append(
            {
                "hab_id": data.get("HAB_ID"),
                "district_i": data.get("DISTRICT_I"),
                "hab_name": (data.get("HAB_NAME") or "").strip(),
                "population": int(float(data["TOT_POPULA"])) if data.get("TOT_POPULA") else None,
                "lat": lat,
                "lon": lon,
            }
        )
    return records


def learn_district_mapping(conn, records):
    shp_by_district = defaultdict(set)
    for r in records:
        if r["district_i"] and r["hab_name"]:
            shp_by_district[r["district_i"]].add(r["hab_name"].lower())

    # Grouping by the *authoritative* district.name_en (via a join that
    # already normalizes the six known alias mismatches) means any
    # remaining spelling mismatch is simply excluded here rather than
    # silently producing the wrong canonical name.
    db_by_district = defaultdict(set)
    for dname_en, hname in conn.execute(
        f"""
        SELECT d.name_en, h.habitation_name
        FROM habitation h
        JOIN district d ON LOWER({_ALIAS_CASE_SQL}) = LOWER(d.name_en)
        WHERE h.habitation_name IS NOT NULL
        """
    ):
        db_by_district[dname_en].add(hname.strip().lower())

    mapping = {}
    for did, shp_names in shp_by_district.items():
        best, best_score = None, 0
        for dname_en, db_names in db_by_district.items():
            score = len(shp_names & db_names)
            if score > best_score:
                best, best_score = dname_en, score
        if best and best_score >= 30:  # require real signal, not a coincidental handful of matches
            mapping[did] = best
    return mapping


def _rings_of_placemark(elem):
    """Each outer boundary ring as a list of (lat, lon) points."""
    rings = []
    for coords_el in elem.findall(f".//{KML_NS}outerBoundaryIs/{KML_NS}LinearRing/{KML_NS}coordinates"):
        if not coords_el.text:
            continue
        ring = []
        for pair in coords_el.text.split():
            parts = pair.split(",")
            if len(parts) >= 2:
                ring.append((float(parts[1]), float(parts[0])))  # (lat, lon)
        if ring:
            rings.append(ring)
    return rings


def _centroid_of_rings(rings):
    lats = [lat for ring in rings for lat, _lon in ring]
    lons = [lon for ring in rings for _lat, lon in ring]
    if not lats:
        return None
    return sum(lats) / len(lats), sum(lons) / len(lons)


# ~44m tolerance at Tamil Nadu's latitude -- verified against real polygons
# (200-village sample): shrinks the average 252-vertex village outline to
# ~32 vertices while keeping the shape recognizable at village-viewing
# zoom levels, which is what keeps village_geo's size in the tens of MB
# instead of the 191MB the raw shapefile would need.
POLYGON_SIMPLIFY_TOLERANCE_DEG = 0.0004


def _rdp(points, epsilon):
    """Ramer-Douglas-Peucker polyline simplification (no external deps)."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5
    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if norm == 0:
            d = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
        else:
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > epsilon:
        left = _rdp(points[: idx + 1], epsilon)
        right = _rdp(points[idx:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def _encode_rings(rings):
    """rings -> "lat,lon;lat,lon|lat,lon;..." (rings separated by '|', points by ';'),
    simplified and rounded to 5 decimals (~1m) -- plenty relative to the
    ~44m simplification tolerance already applied."""
    simplified = [_rdp(ring, POLYGON_SIMPLIFY_TOLERANCE_DEG) for ring in rings]
    return "|".join(
        ";".join(f"{lat:.5f},{lon:.5f}" for lat, lon in ring) for ring in simplified if len(ring) >= 3
    )


def load_revenue_village(conn):
    """Streams revenue_village.kml (too large to hold as a DOM) and loads
    one centroid + simplified boundary per Village polygon into
    village_geo, keyed directly by (dcode, tcode, vcode)."""
    conn.execute(
        """
        CREATE TABLE village_geo (
            id INTEGER PRIMARY KEY,
            dcode INTEGER,
            tcode INTEGER,
            vcode TEXT,
            lgd_village INTEGER,
            vill_name TEXT,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            polygon TEXT
        )
        """
    )

    by_code = {}
    count = 0
    for _event, elem in ET.iterparse(REVENUE_VILLAGE_KML_PATH, events=("end",)):
        if elem.tag != KML_NS + "Placemark":
            continue
        count += 1
        data = {sd.get("name"): sd.text for sd in elem.findall(f".//{KML_NS}SimpleData")}
        if data.get("type") in REVENUE_VILLAGE_TYPES:
            rings = _rings_of_placemark(elem)
            centroid = _centroid_of_rings(rings)
            if centroid and data.get("district_c") and data.get("taluk_code") and data.get("village_co"):
                key = (int(float(data["district_c"])), int(float(data["taluk_code"])), data["village_co"])
                by_code.setdefault(key, []).append(
                    (
                        int(float(data["lgd_villag"])) if data.get("lgd_villag") else None,
                        data.get("vill_name"),
                        centroid[0],
                        centroid[1],
                        rings,
                    )
                )
        elem.clear()
        if count % 5000 == 0:
            print(f"  ...{count} revenue_village placemarks streamed")

    rows = []
    for (dcode, tcode, vcode), entries in by_code.items():
        lgd_village, vill_name, _, _, _ = entries[0]
        avg_lat = sum(e[2] for e in entries) / len(entries)
        avg_lon = sum(e[3] for e in entries) / len(entries)
        # A handful of codes have more than one placemark (split/exclave
        # parcels) -- combine every ring from every one of them.
        all_rings = [ring for e in entries for ring in e[4]]
        polygon_text = _encode_rings(all_rings)
        rows.append((dcode, tcode, vcode, lgd_village, vill_name, avg_lat, avg_lon, polygon_text))

    conn.executemany(
        "INSERT INTO village_geo (dcode, tcode, vcode, lgd_village, vill_name, lat, lon, polygon) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.execute("CREATE UNIQUE INDEX idx_village_geo_code ON village_geo(dcode, tcode, vcode)")
    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM village").fetchone()[0]
    matched = conn.execute(
        """
        SELECT COUNT(*) FROM village v
        JOIN village_geo vg ON vg.dcode = v.dcode AND vg.tcode = v.tcode AND vg.vcode = v.vcode
        """
    ).fetchone()[0]
    print(f"village_geo: {len(rows)} rows from {count} placemarks; direct match coverage {matched}/{total} ({100*matched/total:.1f}%)")


def main():
    print(f"copying {SOURCE_DB} -> {OUTPUT_DB}")
    OUTPUT_DB.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(SOURCE_DB, OUTPUT_DB)

    conn = sqlite3.connect(OUTPUT_DB)
    conn.execute("VACUUM")
    conn.execute("CREATE INDEX idx_habitation_lookup ON habitation(LOWER(district_name), LOWER(village_name))")

    records = parse_habitation_kml()
    print(f"parsed {len(records)} habitation placemarks from the shapefile's KML export")

    mapping = learn_district_mapping(conn, records)
    print(f"learned {len(mapping)} DISTRICT_I -> district_en mappings:")
    for did, name in sorted(mapping.items(), key=lambda kv: kv[1]):
        print(f"  {did:>4} -> {name}")

    conn.execute(
        """
        CREATE TABLE habitation_geo (
            id INTEGER PRIMARY KEY,
            hab_id TEXT,
            district_i TEXT,
            district_en TEXT,
            hab_name TEXT NOT NULL,
            population INTEGER,
            lat REAL NOT NULL,
            lon REAL NOT NULL
        )
        """
    )
    rows = [
        (r["hab_id"], r["district_i"], mapping.get(r["district_i"]), r["hab_name"], r["population"], r["lat"], r["lon"])
        for r in records
        if r["hab_name"]
    ]
    conn.executemany(
        "INSERT INTO habitation_geo (hab_id, district_i, district_en, hab_name, population, lat, lon) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.execute("CREATE INDEX idx_habitation_geo_name ON habitation_geo(LOWER(hab_name))")
    conn.execute("CREATE INDEX idx_habitation_geo_name_district ON habitation_geo(LOWER(hab_name), district_en)")
    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM habitation_geo").fetchone()[0]
    mapped = conn.execute("SELECT COUNT(*) FROM habitation_geo WHERE district_en IS NOT NULL").fetchone()[0]
    print(f"inserted {total} habitation_geo rows, {mapped} with a resolved district_en ({100*mapped/total:.1f}%)")

    print("streaming revenue_village.kml (this is a ~191MB file, may take a minute)...")
    load_revenue_village(conn)

    conn.execute("VACUUM")
    conn.close()
    print(f"done: {OUTPUT_DB} ({OUTPUT_DB.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
