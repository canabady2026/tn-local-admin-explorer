# TN Local Administration Explorer

A static, self-contained Next.js app for browsing Tamil Nadu's local
administration hierarchy (38 districts → 298 taluks → 17,738 villages,
bilingual English/Tamil), designed to be hosted for free on GitHub Pages.
Sibling project to
[TN Highways Explorer](https://canabady2026.github.io/tnhighways-explorer/),
same architecture, adapted for this dataset.

## Offline-only, on purpose

There's no backend here -- the whole dataset (district/taluk/village
hierarchy, rural habitation coverage records, ~66,918 geocoded habitation
points and ~17,318 revenue village boundary centroids from two
shapefiles, and a small "notable people" table) is queried entirely in
the browser via [sql.js](https://sql.js.org) (SQLite compiled to
WebAssembly) against a bundled copy of the source database
(`public/data/tndb2021.db`, ~24MB, built by `scripts/build_bundled_db.py`
-- see below). No API, no server, no health checks -- just static files.

## Project layout

```
src/
├── app/page.tsx                  The whole app: filters, table, KPIs, wiring
├── components/
│   ├── FilterPanel.tsx             District/taluk cascading selects, search
│   ├── VillagesTable.tsx            Sortable results table
│   ├── Pagination.tsx               Page size + prev/next
│   ├── VillageDetailDrawer.tsx      Per-village detail: map, habitations, notable people
│   ├── VillageMap.tsx                Embedded map: village/habitation boundary coords, else Nominatim fallback
│   ├── LocationBadge.tsx            Clickable district/taluk badges (distinct colors)
│   ├── KpiCards.tsx                  Header stat tiles (whole-dataset totals)
│   ├── FilterSummary.tsx             Aggregate totals for the current filter
│   ├── FontControls.tsx              Font size/family controls
│   └── DbStatusBadge.tsx             Offline dataset load status
└── lib/
    ├── types.ts                     Row/filter/result shapes
    ├── sqlite.ts                     All queries against the bundled .db, incl. village_geo/habitation_geo lookup
    ├── osmVillage.ts                  Nominatim geocoding fallback (see below)
    ├── filters.ts                    Filter state helpers
    ├── fontPrefs.ts                   Font preference state + persistence
    └── basePath.ts                    GitHub Pages subpath-aware asset URLs

scripts/
└── build_bundled_db.py           Rebuilds public/data/tndb2021.db (see "Refreshing the bundled dataset")
```

## The data

Source: `~/dev/tn-local-administration/tndb2021.db`. Four real tables:

| Table | Rows | Notes |
|---|---|---|
| `district` | 38 | `dcode`, `name_en`, `name_ta`, `taluk_count`, `status` |
| `taluk` | 298 | `dcode`+`tcode` unique per district; `name_en`, `name_ta` |
| `village` | 17,738 | `dcode`+`tcode`+`vcode` unique; `latitude`/`longitude` columns exist but are **null for every row** in this dataset -- the map in the detail drawer geocodes by name at view time instead (see below) |
| `habitation` | 80,359 | Rural drinking-water coverage records (circa 2012), keyed by **free-text** `district_name`/`block_name`/`panchayat_name`/`village_name`/`habitation_name` -- no foreign key to `village` |
| `speciality` | 12 | Notable people, properly linked via `village_id` -- very sparse (only "cinema_personality" entries currently) |
| `habitation_geo` | 66,918 | **Added by this project**, from `~/dev/tn-local-administration/Habitation_Tamilnadu/Habitation.shp` (via its KML export) -- real lat/lon per habitation point, plus a learned `district_en` (see below) |
| `village_geo` | 17,318 | **Added by this project**, from `~/dev/tn-local-administration/revenue_village.kml` -- one centroid per revenue village polygon, keyed directly by `(dcode, tcode, vcode)` (see below) |

**Habitation matching is best-effort.** Since `habitation` has no ID
linking it to `village`, the detail drawer matches on
`LOWER(district_name) = LOWER(d.name_en) AND LOWER(village_name) =
LOWER(v.name_en)` -- with one correction: six `habitation.district_name`
values don't exactly match `district.name_en`'s spelling (`kanchipuram` vs
`Kancheepuram`, `nilgiris` vs `The Nilgiris`, `thoothukudi` vs
`Thoothukkudi`, `tiruvallur` vs `Thiruvallur`, `tiruvarur` vs
`Thiruvarur`, `villupuram` vs `Viluppuram`), silently excluding every
habitation in those six districts unless normalized first (`DISTRICT_ALIASES`
in `src/lib/sqlite.ts`). Verified impact of fixing it: **3,326 → 4,287 of
17,738 villages (~24%)** now get at least one habitation match. The rest
have no equivalent habitation record, either because none exists or
because the naming granularity differs (`habitation.village_name`
sometimes reflects a panchayat name rather than the finer revenue-village
unit `village.name_en` represents). An expression index
(`idx_habitation_lookup` on `LOWER(district_name), LOWER(village_name)`)
keeps that lookup fast despite the free-text join.

**The village map resolves a location in three stages, most to least
confident:**

1. **`village_geo`, direct match on `(dcode, tcode, vcode)`.**
   `revenue_village.kml`'s `district_c`/`taluk_code`/`village_co` fields
   turned out to match our own village table's codes exactly (verified
   against real rows) -- `scripts/build_bundled_db.py` streams its
   ~18,516 placemarks (it's a 191MB file, too large to hold as a DOM;
   `ET.iterparse` + `elem.clear()` keeps memory bounded), keeps the
   17,322 typed `"Village"`/`"Village (Uninhabitable)"` polygons, and
   averages each one's outer-boundary coordinates into a centroid.
   **Verified coverage: 96.2% of all villages (17,056/17,738)** --
   easily the biggest single improvement, since it's a real boundary
   centroid for that exact village rather than a name-based proxy.
2. **`habitation_geo`, via a matched habitation** (see above) -- catches
   some of the remaining 3.8%, ~21% of all villages on its own where it
   overlaps.
3. **Nominatim**, geocoding `<village>, <district> District, Tamil Nadu,
   India` (`featureType=settlement` in `src/lib/osmVillage.ts`),
   accepting a result only if its `class` is `place` *and* the target
   district's name appears in the result's `display_name` -- villages are
   numerous enough that same-named places recur across districts, and a
   bare name search without that check can resolve to an unrelated place,
   or even a road with a similar name, in the wrong district entirely.

The residual gap after stage 1 is mostly urbanized ex-villages (Chennai
suburbs like Adambakkam, Alandur, Nanganallur) that `revenue_village.kml`
files under a `"Corporation"`/`"Municipality"` boundary instead of a
`"Village"` polygon -- a centroid of an entire corporation wouldn't give
an accurate point for one specific locality anyway, so these fall through
to stages 2 and 3 rather than forcing a misleading match.
`village-master.csv` (a `dcode`/`tcode`/`vcode` ↔ LGD-code crosswalk) was
tested as a bridge to recover these via LGD codes instead; it recovered
**zero** of the 682 stage-1 gap villages -- they're absent from that file
too -- so it isn't used.

Even before stage 1 existed, the habitation chain alone recovered real
cases Nominatim can't: "Kathalampattu" in Vellore has no usable Nominatim
result at all, but now resolves via its own village boundary centroid
directly (stage 1), and previously via its matched habitation's
coordinates (stage 2) -- both land in the same part of Vellore.

**Leaflet's default marker icon needed a fix.** Its icon/shadow images are
referenced via relative URLs baked into Leaflet's own JS, which don't
resolve once bundled by webpack -- they'd silently fail to load, leaving
just the pin's shadow or nothing at all. `public/leaflet/` carries local
copies (same pattern as the wasm/db assets), and `VillageMap.tsx` points
`L.Icon.Default` at them once per session before creating any marker.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Building the static export

```bash
npm run build       # writes ./out, fully static (output: "export")
npx serve out        # try it locally
```

### Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `out/` on every push
to `main` (or manual dispatch), setting `NEXT_BASE_PATH=/<repo-name>`
automatically since a GitHub Pages *project* site is served from
`https://<user>.github.io/<repo>/`, not the domain root.

One-time setup after pushing this repo to GitHub:

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Push to `main` (or run the workflow manually from the Actions tab).

To build locally exactly as CI does:

```bash
NEXT_BASE_PATH=/tn-local-admin-explorer npm run build
```

## Refreshing the bundled dataset

```bash
python3 scripts/build_bundled_db.py
```

Rebuilds `public/data/tndb2021.db` from
`~/dev/tn-local-administration/tndb2021.db`,
`~/dev/tn-local-administration/Habitation_Tamilnadu/Habitation.kml`, and
`~/dev/tn-local-administration/revenue_village.kml` -- vacuums, adds the
habitation lookup index, loads the habitation shapefile into
`habitation_geo` (re-learning the `DISTRICT_I` → `district_en` mapping),
and streams the revenue village shapefile into `village_geo`. Takes
about 15 seconds, most of it streaming the 191MB `revenue_village.kml`.
See the script's docstring for the full pipeline.
