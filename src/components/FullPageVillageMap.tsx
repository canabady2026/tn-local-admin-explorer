"use client";

import useSWR from "swr";
import { VillageMap } from "@/components/VillageMap";
import { withBasePath } from "@/lib/basePath";
import { getVillageDetail } from "@/lib/sqlite";

export function FullPageVillageMap({ villageId }: { villageId: number }) {
  const { data: detail, isLoading } = useSWR(["village-detail", villageId] as const, () =>
    getVillageDetail(villageId)
  );

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <a
          href={withBasePath("/")}
          className="text-sm text-slate-500 underline decoration-dotted hover:text-slate-700"
        >
          ← Back to explorer
        </a>
        {detail && (
          <div>
            <span className="font-bold text-slate-900">{detail.village.village_en}</span>
            <span className="ml-1.5 font-bold text-slate-700">{detail.village.village_ta}</span>
          </div>
        )}
      </header>
      <div className="flex-1 p-3">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>
        )}
        {!isLoading && !detail && <p className="p-4 text-sm text-slate-500">Village not found.</p>}
        {!isLoading && detail && (
          <VillageMap
            villageEn={detail.village.village_en}
            villageTa={detail.village.village_ta}
            talukEn={detail.village.taluk_en}
            districtEn={detail.village.district_en}
            geo={detail.geo}
            fullHeight
          />
        )}
      </div>
    </div>
  );
}
