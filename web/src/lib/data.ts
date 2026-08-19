import type {
  CityDatum,
  CityTier,
  DatasetDescriptor,
  DatasetShard,
  FrequencyDatum,
  Manifest,
  OverallTrendDatum,
  TierTrendDatum,
} from "../types";
import { completeMonths, roundOne } from "./format";

const shardCache = new Map<string, Promise<DatasetShard>>();
let manifestRequest: Promise<Manifest> | undefined;

function assetUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), document.baseURI).toString();
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`数据请求失败：${response.status} ${path}`);
  return (await response.json()) as T;
}

export function loadManifest(): Promise<Manifest> {
  manifestRequest ??= fetchJson<Manifest>("data/manifest.json");
  return manifestRequest;
}

export function loadShard(descriptor: DatasetDescriptor): Promise<DatasetShard> {
  const cached = shardCache.get(descriptor.id);
  if (cached) return cached;
  const request = fetchJson<DatasetShard>(`data/${descriptor.path}`);
  shardCache.set(descriptor.id, request);
  return request;
}

export function cityDataForPeriod(
  manifest: Manifest,
  shard: DatasetShard,
  period: string,
): CityDatum[] {
  const periodIndex = shard.periods.indexOf(period);
  if (periodIndex < 0) return [];
  const row = shard.values[periodIndex] ?? [];
  const data = manifest.cities.flatMap((city, index) => {
    const value = row[index];
    if (value == null) return [];
    return [{ city: city.name, tier: city.tier, value, change: roundOne(value - 100), rank: 0 }];
  });
  data.sort((left, right) => right.change - left.change || left.city.localeCompare(right.city, "zh-CN"));
  return data.map((datum, index) => ({ ...datum, rank: index + 1 }));
}

export function buildOverallTrend(manifest: Manifest, shard: DatasetShard): OverallTrendDatum[] {
  if (shard.periods.length === 0) return [];
  const periods = completeMonths(shard.periods[0]!, shard.periods.at(-1)!);
  const rowsByPeriod = new Map(shard.periods.map((period, index) => [period, shard.values[index] ?? []]));
  return periods.map((period) => {
    const changes = (rowsByPeriod.get(period) ?? [])
      .filter((value): value is number => value != null)
      .map((value) => roundOne(value - 100));
    const up = changes.filter((value) => value > 0).length;
    const flat = changes.filter((value) => value === 0).length;
    const down = changes.filter((value) => value < 0).length;
    return {
      period,
      up,
      flat,
      down,
      covered: changes.length,
      complete: changes.length === manifest.cities.length,
    };
  });
}

export function buildTierTrend(manifest: Manifest, shard: DatasetShard): TierTrendDatum[] {
  if (shard.periods.length === 0) return [];
  const periods = completeMonths(shard.periods[0]!, shard.periods.at(-1)!);
  const rowsByPeriod = new Map(shard.periods.map((period, index) => [period, shard.values[index] ?? []]));
  const tiers: CityTier[] = ["一线", "二线", "三线"];
  return tiers.flatMap((tier) => {
    const cityIndexes = manifest.cities.flatMap((city, index) => (city.tier === tier ? [index] : []));
    return periods.map((period) => {
      const row = rowsByPeriod.get(period) ?? [];
      const changes = cityIndexes
        .map((index) => row[index])
        .filter((value): value is number => value != null)
        .map((value) => roundOne(value - 100));
      const up = changes.filter((value) => value > 0).length;
      const flat = changes.filter((value) => value === 0).length;
      const down = changes.filter((value) => value < 0).length;
      const expected = cityIndexes.length;
      return {
        period,
        tier,
        up,
        flat,
        down,
        covered: changes.length,
        expected,
        upPct: expected ? (up / expected) * 100 : 0,
        flatPct: expected ? (flat / expected) * 100 : 0,
        downPct: expected ? (down / expected) * 100 : 0,
        complete: changes.length === expected,
      };
    });
  });
}

export function marketBreadth(item: Pick<OverallTrendDatum, "up" | "down" | "covered">): number | null {
  return item.covered ? roundOne(((item.up - item.down) / item.covered) * 100) : null;
}

export function buildFrequencyDistribution(values: number[]): FrequencyDatum[] {
  const counts = new Map<number, number>();
  for (const value of values) {
    const tenth = Math.round(value * 10);
    counts.set(tenth, (counts.get(tenth) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tenth, count]) => ({ value: tenth / 10, count }));
}

export function datasetForSelection(
  manifest: Manifest,
  houseType: string,
  sizeBand: string,
  metric: string,
): DatasetDescriptor | undefined {
  return manifest.datasets.find(
    (dataset) =>
      dataset.houseType === houseType && dataset.sizeBand === sizeBand && dataset.metric === metric,
  );
}
