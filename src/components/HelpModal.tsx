"use client";

import { useState } from "react";

/** Self-contained walkthrough: owns its own open/close state, like
 * FontControls/DbStatusBadge own their own preference/status state -- just
 * drop <HelpModal /> in the header, no props needed. */
export function HelpModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="How to use this app"
        title="How to use this app"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">Walkthrough</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-5 text-sm text-slate-700">
              <section>
                <p>
                  This app browses Tamil Nadu&apos;s <strong>district → taluk → village</strong> hierarchy
                  (bilingual English/Tamil), plus a best-effort rural drinking-water habitation cross-reference.
                  Everything runs entirely offline: the dataset is a SQLite database queried in-browser via
                  WebAssembly -- no server, no network required except to load map tiles.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-slate-900">Dataset status</h3>
                <p>
                  The badge in the top-right shows whether the offline dataset has finished loading into your
                  browser. It only needs to load once per visit.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-slate-900">Filtering</h3>
                <p>
                  The left panel filters the village list: free-text search (matches district, taluk, or village
                  name, in either language), a District → Taluk cascade, and a village-name-contains filter.
                  &quot;clear all&quot; resets everything at once.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-slate-900">Village details &amp; map</h3>
                <p>
                  Click any row to open a detail panel: clickable District/Taluk badges that jump the main filters
                  to that place, a map of the village (its real boundary polygon in thick blue when known, otherwise
                  an approximate marker), rural habitation records matched to it by name (population, status), and
                  any notable people recorded from that village. &quot;Open in full window&quot; gives the map more
                  room.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-slate-900">Results map</h3>
                <p>
                  &quot;View matching villages on map&quot; opens a full-page map plotting every village matching
                  your current filters (up to 300 at once) as boundary polygons or markers, each labeled with its
                  Tamil name, English name, taluk, and district.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-slate-900">Font controls</h3>
                <p>
                  The A-/A/A+ buttons and font-style dropdown next to this help button adjust text size and typeface
                  for the whole app -- your choice is remembered on this device.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
