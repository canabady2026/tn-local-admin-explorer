"use client";

import { useDbStatus } from "@/lib/useDbStatus";

const STYLES = {
  loading: "bg-slate-100 text-slate-600 border-slate-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
};

const LABEL = {
  loading: "Loading offline dataset…",
  ready: "Offline dataset ready",
  error: "Failed to load dataset",
};

const DOT = {
  loading: "bg-slate-400 animate-pulse",
  ready: "bg-emerald-500",
  error: "bg-red-500",
};

export function DbStatusBadge() {
  const status = useDbStatus();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {LABEL[status]}
    </span>
  );
}
