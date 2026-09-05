#!/usr/bin/env python3
"""
Builds public/data/tndb2021.db from the source database plus the
Habitation_Tamilnadu shapefile (via its KML export), both expected at
~/dev/tn-local-administration/ by default.

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
  3. Loads the habitation shapefile's ~66,918 points into a new
     `habitation_geo` table, with each point's DISTRICT_I code resolved to
     our district.name_en by habitation-name-set overlap against the
     (alias-normalized) habitation table -- the shapefile predates Tamil
     Nadu's 2019/2020 district splits, so it has 37 codes against our 38
     districts; PARENT_DISTRICT in src/lib/sqlite.ts maps the six newer
     districts back to their pre-split parent at query time.
  4. VACUUMs again and writes the result to public/data/tndb2021.db.

The village detail drawer's map first tries to approximate a village's
location from a matched habitation's real coordinates here, and only
falls back to geocoding the village by name via Nominatim if that fails
(see src/lib/osmVillage.ts) -- verified against real villages: the
shapefile chain alone resolves ~21% of all villages (3,756/17,738),
including some Nominatim can't (e.g. "Kathalampattu" in Vellore has no
usable Nominatim result at all, but resolves via a matched habitation's
shapefile coordinates).
"""

import shutil
import sqlite3
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

SOURCE_DIR = Path.home() / "dev" / "tn-local-administration"
SOURCE_DB = SOURCE_DIR / "tndb2021.db"
KML_PATH = SOURCE_DIR / "Habitation_Tamilnadu" / "Habitation.kml"
OUTPUT_DB = Path(__file__).resolve().parent.parent / "public" / "data" / "tndb2021.db"

NS = {"k": "http://www.opengis.net/kml/2.2"}

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


def parse_kml():
    tree = ET.parse(KML_PATH)
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


def main():
    print(f"copying {SOURCE_DB} -> {OUTPUT_DB}")
    OUTPUT_DB.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(SOURCE_DB, OUTPUT_DB)

    conn = sqlite3.connect(OUTPUT_DB)
    conn.execute("VACUUM")
    conn.execute("CREATE INDEX idx_habitation_lookup ON habitation(LOWER(district_name), LOWER(village_name))")

    records = parse_kml()
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

    conn.execute("VACUUM")
    conn.close()
    print(f"done: {OUTPUT_DB} ({OUTPUT_DB.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
