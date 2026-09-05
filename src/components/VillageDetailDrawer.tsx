"use client";

import useSWR from "swr";
import { LocationBadge } from "@/components/LocationBadge";
import { VillageMap } from "@/components/VillageMap";
import { getVillageDetail } from "@/lib/sqlite";
import type { LocationSelection } from "@/lib/types";

interface Props {
  villageId: number | null;
  onClose: () => void;
  onNavigateToLocation: (location: LocationSelection) => void;
}

export function VillageDetailDrawer({ villageId, onClose, onNavigateToLocation }: Props) {
  const key = villageId != null ? (["village-detail", villageId] as const) : null;
  const { data: detail, isLoading: loading } = useSWR(key, () => getVillageDetail(villageId!));

  if (villageId == null) return null;

  const navigate = (location: LocationSelection) => {
    onNavigateToLocation(location);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {detail?.village.village_en ?? "Loading…"}
            </h2>
            {detail && <p className="mt-0.5 text-base font-bold text-slate-700">{detail.village.village_ta}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        {!loading && !detail && <p className="text-sm text-slate-500">No data found for this village.</p>}

        {!loading && detail && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <LocationBadge
                category="district"
                value={detail.village.district_en}
                onClick={() => navigate({ district: detail.village.district_en })}
              />
              <span className="text-slate-300">·</span>
              <LocationBadge
                category="taluk"
                value={detail.village.taluk_en}
                onClick={() => navigate({ district: detail.village.district_en, taluk: detail.village.taluk_en })}
              />
            </div>

            <h3 className="mb-2 text-sm font-semibold text-slate-900">Map</h3>
            <div className="mb-5">
              <VillageMap
                villageEn={detail.village.village_en}
                districtEn={detail.village.district_en}
                geo={detail.geo}
              />
            </div>

            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Habitations {detail.habitations.length > 0 && `(${detail.habitations.length})`}
            </h3>
            {detail.habitations.length === 0 ? (
              <p className="mb-5 text-sm text-slate-500">
                No rural habitation coverage records matched to this village by name.
              </p>
            ) : (
              <ul className="mb-5 flex flex-col gap-2">
                {detail.habitations.map((hab, i) => {
                  const population =
                    hab.generalCurrentPopulation + hab.scCurrentPopulation + hab.stCurrentPopulation;
                  return (
                    <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="font-medium text-slate-900">{hab.habitation_name}</div>
                      <div className="mt-1 text-slate-600">
                        Population: <span className="tabular-nums">{population.toLocaleString()}</span> ·{" "}
                        <span className="capitalize">{hab.status}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {detail.notablePeople.length > 0 && (
              <>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Notable people from here</h3>
                <ul className="flex flex-col gap-2">
                  {detail.notablePeople.map((person, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="font-medium text-slate-900">
                        {person.name_en}
                        {person.name_ta && <span className="text-slate-500"> · {person.name_ta}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-slate-600">
                        <span className="capitalize">{person.speciality_type.replace(/_/g, " ")}</span>
                        {person.link && (
                          <a
                            href={person.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline decoration-dotted hover:text-blue-800"
                          >
                            link ↗
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
