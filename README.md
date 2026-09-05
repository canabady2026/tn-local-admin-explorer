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
points from a shapefile, and a small "notable people" table) is queried
entirely in the browser via [sql.js](https://sql.js.org) (SQLite compiled
to WebAssembly) against a bundled copy of the source database
(`public/data/tndb2021.db`, ~23MB, built by `scripts/build_bundled_db.py`
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
│   ├── VillageMap.tsx                Embedded map: shapefile coords, else Nominatim fallback
│   ├── LocationBadge.tsx            Clickable district/taluk badges (distinct colors)
│   ├── KpiCards.tsx                  Header stat tiles (whole-dataset totals)
│   ├── FilterSummary.tsx             Aggregate totals for the current filter
│   ├── FontControls.tsx              Font size/family controls
│   └── DbStatusBadge.tsx             Offline dataset load status
└── lib/
    ├── types.ts                     Row/filter/result shapes
    ├── sqlite.ts                     All queries against the bundled .db, incl. habitation_geo lookup
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

**The village map tries real coordinates first, then falls back to
geocoding by name.** `village.latitude`/`longitude` are null for every
row, but a matched habitation often has a real point in the
`Habitation_Tamilnadu` shapefile (see `habitation_geo` above) -- the
detail drawer tries each matched habitation's name against it in order
(`findVillageGeo` in `src/lib/sqlite.ts`), requiring `district_en` to
match (through `PARENT_DISTRICT` for the six districts created by TN's
2019/2020 splits, since the shapefile predates them and files their
habitations under the old parent district instead). This resolves
**~21% of all villages (3,756/17,738)** on its own, deterministically and
with no network request. Only when that fails does `src/lib/osmVillage.ts`
fall back to geocoding `<village>, <district> District, Tamil Nadu,
India` against Nominatim (`featureType=settlement`), accepting a result
only if its `class` is `place` *and* the target district's name appears
in the result's `display_name` -- villages are numerous enough that
same-named places recur across districts, and a bare name search without
that check can resolve to an unrelated place, or even a road with a
similar name, in the wrong district entirely.

Between the two, most villages still won't resolve -- that's the honest
state of freely available open data at this granularity, not a bug. The
shapefile chain recovers real cases Nominatim alone cannot: e.g.
"Kathalampattu" in Vellore has no usable Nominatim result at all, but
resolves via its matched habitation "Arunthathi colony"'s shapefile
coordinates.

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
`~/dev/tn-local-administration/tndb2021.db` and
`~/dev/tn-local-administration/Habitation_Tamilnadu/Habitation.kml` --
vacuums, adds the habitation lookup index, loads the habitation shapefile
into `habitation_geo`, and re-learns the `DISTRICT_I` → `district_en`
mapping. See the script's docstring for the full pipeline.
