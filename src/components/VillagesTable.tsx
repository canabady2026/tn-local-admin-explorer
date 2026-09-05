"use client";

import type { VillageRow } from "@/lib/types";

interface Column {
  key: keyof VillageRow;
  label: string;
}

const COLUMNS: Column[] = [
  { key: "district_en", label: "District" },
  { key: "taluk_en", label: "Taluk" },
  { key: "village_en", label: "Village" },
  { key: "village_ta", label: "Village (தமிழ்)" },
];

interface Props {
  rows: VillageRow[];
  loading: boolean;
  sort: string;
  onSortChange: (sort: string) => void;
  onRowClick: (villageId: number) => void;
}

export function VillagesTable({ rows, loading, sort, onSortChange, onRowClick }: Props) {
  function toggleSort(col: keyof VillageRow) {
    if (sort === col) onSortChange(`-${col}`);
    else if (sort === `-${col}`) onSortChange("");
    else onSortChange(col);
  }

  function sortIndicator(col: keyof VillageRow) {
    if (sort === col) return "↑";
    if (sort === `-${col}`) return "↓";
    return "";
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900"
              >
                {col.label} <span className="text-slate-400">{sortIndicator(col.key)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-3 py-2">
                    <span className="inline-block h-4 w-full max-w-28 animate-pulse rounded bg-slate-100" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-slate-500">
                No villages match these filters.
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr key={row.village_id} onClick={() => onRowClick(row.village_id)} className="cursor-pointer hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.district_en}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.taluk_en}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{row.village_en}</td>
                <td className="px-3 py-2 text-slate-700">{row.village_ta}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
