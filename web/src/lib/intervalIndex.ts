import type { DatasetDescriptor, DatasetShard, Manifest, TrendRange } from "../types";
import { completeMonths } from "./format";

export interface IntervalSelection {
  cities: string[];
  start: string;
  end: string;
}

export interface IntervalPoint {
  period: string;
  index: number | null;
  mom: number | null;
  imputed: boolean;
  estimated: boolean;
}

const PERIOD_PATTERN = /^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/;
export const MAX_INTERVAL_CITIES = 5;

export function intervalStartForRange(first: string, end: string, range: TrendRange): string {
  if (range === "all") return first;
  const years = { "3y": 3, "5y": 5, "10y": 10 }[range];
  // Include the base month so a three-year interval contains 36 compounded monthly changes.
  const start = `${Number(end.slice(0, 4)) - years}${end.slice(4)}`;
  return start < first ? first : start;
}

export function resolveIntervalSelection(
  manifest: Manifest,
  descriptor: DatasetDescriptor,
  requested: Partial<IntervalSelection> = {},
): IntervalSelection {
  const first = descriptor.periods[0] ?? manifest.periodRange[0];
  const last = descriptor.periods.at(-1) ?? manifest.periodRange[1];
  const clamp = (period: string) => period < first ? first : period > last ? last : period;
  const end = requested.end && PERIOD_PATTERN.test(requested.end) ? clamp(requested.end) : last;
  const start = clamp(requested.start && PERIOD_PATTERN.test(requested.start)
    ? requested.start : intervalStartForRange(first, end, "5y"));
  const availableCities = new Set(manifest.cities.map((city) => city.name));
  const fallback = [availableCities.has("北京") ? "北京" : manifest.cities[0]!.name];
  const requestedCities = requested.cities?.map((city) => city.trim());
  const validCities = [...new Set(requestedCities)].filter((city) => availableCities.has(city)).slice(0, MAX_INTERVAL_CITIES);
  const cities = requestedCities?.length === 0 ? [] : validCities.length ? validCities : fallback;
  return { cities, start: start > end ? end : start, end };
}

export function buildIntervalIndex(shard: DatasetShard, cityIndex: number, start: string, end: string, fillMissing = false) {
  if (!shard.id.endsWith("-mom")) throw new Error("区间指数仅使用环比数据");
  if (!PERIOD_PATTERN.test(start) || !PERIOD_PATTERN.test(end) || start > end) {
    throw new RangeError("区间月份无效");
  }
  if (!Number.isInteger(cityIndex) || cityIndex < 0) throw new RangeError("城市序号无效");
  const rows = new Map(shard.periods.map((period, index) => [period, shard.values[index]]));
  const missingPeriods: string[] = [];
  const imputedPeriods: string[] = [];
  let current: number | null = 100;
  const points: IntervalPoint[] = completeMonths(start, end).map((period, offset) => {
    // The base month is 100 by definition; its own MoM belongs to the preceding interval.
    if (offset === 0) return { period, index: 100, mom: null, imputed: false, estimated: false };
    const raw = rows.get(period)?.[cityIndex];
    const mom = raw != null && Number.isFinite(raw) && raw > 0 ? raw : null;
    if (mom == null) {
      missingPeriods.push(period);
      if (fillMissing) imputedPeriods.push(period);
      else current = null;
    } else if (current != null) {
      current *= mom / 100;
    }
    return { period, index: current, mom, imputed: mom == null && fillMissing, estimated: imputedPeriods.length > 0 };
  });
  return { points, missingPeriods, imputedPeriods, endIndex: points.at(-1)?.index ?? null };
}

export function intervalLineSegments(points: IntervalPoint[]) {
  const segments: { imputed: boolean; data: (number | null)[] }[] = [];
  if (points.length === 1) return [{ imputed: false, data: [points[0]!.index] }];
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    const previous = points[index - 1]!;
    if (point.index == null || previous.index == null) continue;
    let segment = segments.at(-1);
    // Adjacent runs share the boundary point, but never connect across a different edge type.
    if (!segment || segment.imputed !== point.imputed || segment.data[index - 1] == null) {
      segment = { imputed: point.imputed, data: Array<number | null>(points.length).fill(null) };
      segment.data[index - 1] = previous.index;
      segments.push(segment);
    }
    segment.data[index] = point.index;
  }
  return segments;
}

export function groupIntervalMissingPeriods(results: { city: string; imputedPeriods: string[] }[]) {
  const groups = new Map<string, { cities: string[]; periods: string[] }>();
  for (const result of results) {
    if (!result.imputedPeriods.length) continue;
    const key = result.imputedPeriods.join(",");
    const group = groups.get(key);
    if (group) group.cities.push(result.city);
    else groups.set(key, { cities: [result.city], periods: result.imputedPeriods });
  }
  return [...groups.values()];
}
