# TN Local Administration Explorer

A static, self-contained Next.js app for browsing Tamil Nadu's local
administration hierarchy (38 districts → 298 taluks → 17,738 villages,
bilingual English/Tamil), designed to be hosted for free on GitHub Pages.
Sibling project to
[TN Highways Explorer](https://canabady2026.github.io/tnhighways-explorer/),
same architecture, adapted for this dataset.

## Offline-only, on purpose

There's no backend here -- the whole dataset (district/taluk/village
hierarchy, plus rural habitation coverage records and a small "notable
people" table) is queried entirely in the browser via
[sql.js](https://sql.js.org) (SQLite compiled to WebAssembly) against a
bundled copy of the source database
(`public/data/tndb2021.db`, ~14MB, vacuumed and indexed from the original
23MB `tndb2021.db`). No API, no server, no health checks -- just static
files.

## Project layout

```
src/
├── app/page.tsx                  The whole app: filters, table, KPIs, wiring
├── components/
│   ├── FilterPanel.tsx             District/taluk cascading selects, search
│   ├── VillagesTable.tsx            Sortable results table
│   ├── Pagination.tsx               Page size + prev/next
│   ├── VillageDetailDrawer.tsx      Per-village detail: habitations, notable people
│   ├── LocationBadge.tsx            Clickable district/taluk badges (distinct colors)
│   ├── KpiCards.tsx                  Header stat tiles (whole-dataset totals)
│   ├── FilterSummary.tsx             Aggregate totals for the current filter
│   ├── FontControls.tsx              Font size/family controls
│   └── DbStatusBadge.tsx             Offline dataset load status
└── lib/
    ├── types.ts                     Row/filter/result shapes
    ├── sqlite.ts                     All queries against the bundled .db
    ├── filters.ts                    Filter state helpers
    ├── fontPrefs.ts                   Font preference state + persistence
    └── basePath.ts                    GitHub Pages subpath-aware asset URLs
```

## The data

Source: `~/dev/tn-local-administration/tndb2021.db`. Four real tables:

| Table | Rows | Notes |
|---|---|---|
| `district` | 38 | `dcode`, `name_en`, `name_ta`, `taluk_count`, `status` |
| `taluk` | 298 | `dcode`+`tcode` unique per district; `name_en`, `name_ta` |
| `village` | 17,738 | `dcode`+`tcode`+`vcode` unique; `latitude`/`longitude` columns exist but are **null for every row** in this dataset -- no map view is possible here, unlike the highways app |
| `habitation` | 80,359 | Rural drinking-water coverage records (circa 2012), keyed by **free-text** `district_name`/`block_name`/`panchayat_name`/`village_name`/`habitation_name` -- no foreign key to `village` |
| `speciality` | 12 | Notable people, properly linked via `village_id` -- very sparse (only "cinema_personality" entries currently) |

**Habitation matching is best-effort.** Since `habitation` has no ID
linking it to `village`, the detail drawer matches on
`LOWER(district_name) = LOWER(d.name_en) AND LOWER(village_name) =
LOWER(v.name_en)`. Verified against the real data: this matches for
**3,326 of 17,738 villages (~19%)** -- the rest have no equivalent
habitation record, either because none exists or because the naming
granularity differs (`habitation.village_name` sometimes reflects a
panchayat name rather than the finer revenue-village unit `village.name_en`
represents). An expression index
(`idx_habitation_lookup` on `LOWER(district_name), LOWER(village_name)`)
keeps that lookup fast despite the free-text join.

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
cp ~/dev/tn-local-administration/tndb2021.db /tmp/tndb_web.db
sqlite3 /tmp/tndb_web.db "VACUUM;"
sqlite3 /tmp/tndb_web.db "CREATE INDEX idx_habitation_lookup ON habitation(LOWER(district_name), LOWER(village_name));"
cp /tmp/tndb_web.db public/data/tndb2021.db
```
