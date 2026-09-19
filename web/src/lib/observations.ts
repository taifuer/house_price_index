import type { CityTier, DatasetShard, Manifest, SourceDefinition } from "../types";
import { roundOne } from "./format";

export interface Observation {
  period: string;
  city: string;
  tier: CityTier;
  value: number | null;
  change: number | null;
  source?: SourceDefinition;
}

export type ObservationSortKey = "period" | "city" | "tier" | "value" | "change";
export interface ObservationSort {
  key: ObservationSortKey;
  direction: "asc" | "desc";
}

export function buildObservations(
  manifest: Manifest,
  shard: DatasetShard,
  periods: string[],
  selectedCities?: string[],
): Observation[] {
  const periodIndexes = new Map(shard.periods.map((period, index) => [period, index]));
  const selected = selectedCities ? new Set(selectedCities) : null;
  const cities = manifest.cities.map((city, index) => ({ ...city, index }))
    .filter((city) => !selected || selected.has(city.name));

  return periods.flatMap((period) => {
    const periodIndex = periodIndexes.get(period);
    return cities.map((city) => {
      const raw = periodIndex == null ? null : shard.values[periodIndex]?.[city.index];
      const value = raw != null && Number.isFinite(raw) ? raw : null;
      return {
        period,
        city: city.name,
        tier: city.tier,
        value,
        change: value == null ? null : roundOne(value - 100),
        source: periodIndex == null ? undefined : shard.sources[periodIndex],
      };
    });
  });
}

export function sortObservations(rows: Observation[], sort: ObservationSort): Observation[] {
  const tiers: Record<CityTier, number> = { "一线": 1, "二线": 2, "三线": 3 };
  return [...rows].sort((a, b) => {
    const left = sort.key === "tier" ? tiers[a.tier] : a[sort.key];
    const right = sort.key === "tier" ? tiers[b.tier] : b[sort.key];
    // Missing observations stay last in either direction, never alongside zero growth.
    if (left == null && right != null) return 1;
    if (left != null && right == null) return -1;
    const comparison = left == null || right == null ? 0
      : typeof left === "number" && typeof right === "number" ? left - right
        : String(left).localeCompare(String(right), "zh-CN");
    return comparison * (sort.direction === "asc" ? 1 : -1)
      || b.period.localeCompare(a.period)
      || a.city.localeCompare(b.city, "zh-CN");
  });
}
