"use client";

import useSWR from "swr";
import { getDistricts, getTaluks } from "@/lib/sqlite";
import { hasActiveFilters } from "@/lib/filters";
import { EMPTY_FILTERS, type VillagesFilters } from "@/lib/types";

interface Props {
  filters: VillagesFilters;
  onChange: (next: VillagesFilters) => void;
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterPanel({ filters, onChange }: Props) {
  const { data: districts = [] } = useSWR("districts", getDistricts);
  const { data: taluks = [] } = useSWR(["taluks", filters.district], () => getTaluks(filters.district || undefined));

  function set<K extends keyof VillagesFilters>(key: K, value: VillagesFilters[K]) {
    const next = { ...filters, [key]: value };
    if (key === "district") {
      next.taluk = "";
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        {hasActiveFilters(filters) && (
          <button
            onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}
            className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-700"
          >
            clear all
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Search</span>
        <input
          type="text"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="District, taluk, or village — English or தமிழ்"
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
        />
      </label>

      <Select
        label="District"
        value={filters.district}
        onChange={(v) => set("district", v)}
        options={districts.map((d) => d.name_en)}
      />
      <Select
        label="Taluk"
        value={filters.taluk}
        onChange={(v) => set("taluk", v)}
        options={taluks.map((t) => t.name_en)}
        disabled={taluks.length === 0}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Village name contains</span>
        <input
          type="text"
          value={filters.village}
          onChange={(e) => set("village", e.target.value)}
          placeholder="e.g. Kanchi"
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
        />
      </label>
    </div>
  );
}
