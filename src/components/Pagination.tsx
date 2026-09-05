"use client";

import type { Pagination as PaginationInfo } from "@/lib/types";

interface Props {
  pagination: PaginationInfo | null;
  limit: number;
  onLimitChange: (limit: number) => void;
  onOffsetChange: (offset: number) => void;
}

export function Pagination({ pagination, limit, onLimitChange, onOffsetChange }: Props) {
  const total = pagination?.total ?? 0;
  const offset = pagination?.offset ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-slate-600">
      <div>
        {total > 0 ? (
          <>
            Showing <span className="font-medium text-slate-900">{from}</span>–
            <span className="font-medium text-slate-900">{to}</span> of{" "}
            <span className="font-medium text-slate-900">{total.toLocaleString()}</span> villages
          </>
        ) : (
          "No results"
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span>Rows</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            disabled={offset === 0}
            onClick={() => onOffsetChange(Math.max(0, offset - limit))}
            className="rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="px-1 tabular-nums">
            {page} / {pageCount}
          </span>
          <button
            disabled={pagination?.next_offset == null}
            onClick={() => pagination?.next_offset != null && onOffsetChange(pagination.next_offset)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
