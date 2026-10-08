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
