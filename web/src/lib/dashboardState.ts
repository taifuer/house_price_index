import type { DashboardSection, Manifest, TierFilter, TrendMode, TrendRange } from "../types";
import { datasetForSelection } from "./data";
import { intervalStartForRange, MAX_INTERVAL_CITIES, resolveIntervalSelection, type IntervalSelection } from "./intervalIndex";
import { completeMonths } from "./format";

export const DASHBOARD_SECTIONS: { value: DashboardSection; label: string }[] = [
  { value: "overview", label: "月度概览" },
  { value: "history", label: "历史趋势" },
  { value: "cities", label: "城市看板" },
];
const DEFAULT_CITIES = ["北京"];

export interface DashboardState {
  section: DashboardSection;
  datasetId: string;
  period: string;
  city: string;
  cityDatasetId: string;
  cityPeriod: string;
  trendMode: TrendMode;
  overallRange: TrendRange;
  heatmapRange: TrendRange;
  heatmapTier: TierFilter;
  overviewTier: TierFilter;
  intervalSelection: IntervalSelection;
}

export function readDashboardState(manifest: Manifest, search: string): DashboardState {
  const params = new URLSearchParams(search);
  const descriptor = manifest.datasets.find((dataset) => dataset.id === params.get("view"))
    ?? manifest.datasets.find((dataset) => dataset.id === manifest.defaultDataset)
    ?? manifest.datasets[0]!;
  const cityDescriptor = manifest.datasets.find((dataset) => dataset.id === params.get("cityDataset")) ?? descriptor;
  const intervalDescriptor = datasetForSelection(manifest, cityDescriptor.houseType, cityDescriptor.sizeBand, "环比") ?? cityDescriptor;
  const range = (key: string, fallback: TrendRange): TrendRange => {
    const value = params.get(key);
    return value === "all" || value === "3y" || value === "5y" || value === "10y" ? value : fallback;
  };
  const tier = (key: string): TierFilter => {
    const value = params.get(key);
    return value === "一线" || value === "二线" || value === "三线" ? value : "全部";
  };
  const section = params.get("section");
  const period = params.get("period");
  const trend = params.get("trend");
  const cities = new Set(manifest.cities.map((city) => city.name));
  const requestedCities = (params.get("cities") ?? params.get("indexCities") ?? params.get("indexCity") ?? "").split(",");
  const city = [params.get("city"), requestedCities[0], DEFAULT_CITIES[0]]
    .find((name) => name && cities.has(name)) ?? manifest.cities[0]!.name;
  const cityPeriods = citySnapshotPeriods(manifest, cityDescriptor.sizeBand);
  const cityPeriod = params.get("cityPeriod");
  return {
    section: section === "history" || section === "cities" ? section : "overview",
    datasetId: descriptor.id,
    period: period && descriptor.periods.includes(period) ? period : descriptor.periods.at(-1)!,
    city,
    cityDatasetId: cityDescriptor.id,
    cityPeriod: cityPeriod && cityPeriods.includes(cityPeriod) ? cityPeriod : cityPeriods.at(-1)!,
    trendMode: trend === "tier" || trend === "breadth" ? trend : "overall",
    overallRange: range("range", "10y"),
    heatmapRange: range("heatmapRange", "3y"),
    heatmapTier: tier("heatmapTier"),
    overviewTier: tier("overviewTier"),
    intervalSelection: resolveIntervalSelection(manifest, intervalDescriptor, {
      cities: comparisonCities(manifest, city, requestedCities),
      start: params.get("indexStart") ?? (params.has("cityRange")
        ? intervalStartForRange(intervalDescriptor.periods[0]!, intervalDescriptor.periods.at(-1)!, range("cityRange", "5y")) : undefined),
      end: params.get("indexEnd") ?? undefined,
    }),
  };
}

export function dashboardSearch(manifest: Manifest, state: DashboardState, search = ""): string {
  const params = new URLSearchParams(search);
  const cityDescriptor = manifest.datasets.find((dataset) => dataset.id === state.cityDatasetId)!;
  const intervalDescriptor = datasetForSelection(manifest, cityDescriptor.houseType, cityDescriptor.sizeBand, "环比") ?? cityDescriptor;
  const defaultInterval = resolveIntervalSelection(manifest, intervalDescriptor, { cities: [state.city] });
  const interval = resolveIntervalSelection(manifest, intervalDescriptor, state.intervalSelection);
  const set = (key: string, value: string, fallback?: string) => {
    if (value === fallback) params.delete(key);
    else params.set(key, value);
  };
  set("section", state.section, "overview");
  set("view", state.datasetId);
  set("period", state.period);
  set("city", state.city, DEFAULT_CITIES[0]);
  // Keep the city context explicit so changing national filters cannot alter it on reload.
  set("cityDataset", state.cityDatasetId);
  set("cityPeriod", state.cityPeriod, citySnapshotPeriods(manifest, cityDescriptor.sizeBand).at(-1));
  set("trend", state.trendMode, "overall");
  set("range", state.overallRange, "10y");
  set("heatmapRange", state.heatmapRange, "3y");
  set("heatmapTier", state.heatmapTier, "全部");
  set("overviewTier", state.overviewTier, "全部");
  set("cities", interval.cities.join(","), state.city);
  const defaultIndex = interval.start === defaultInterval.start && interval.end === defaultInterval.end;
  for (const [key, value] of [
    ["indexStart", interval.start], ["indexEnd", interval.end],
  ] as const) {
    if (defaultIndex) params.delete(key);
    else params.set(key, value);
  }
  for (const key of ["indexCity", "indexCities", "indexFill", "indexHouse", "cityRange"]) params.delete(key);
  return `?${params.toString()}`;
}

export function citySnapshotPeriods(manifest: Manifest, sizeBand: string): string[] {
  const periods = manifest.datasets.filter((dataset) => dataset.sizeBand === sizeBand).flatMap((dataset) => dataset.periods).sort();
  return periods.length ? completeMonths(periods[0]!, periods.at(-1)!) : [];
}

export function comparisonCities(manifest: Manifest, primary: string, requested: string[]): string[] {
  const valid = new Set(manifest.cities.map((city) => city.name));
  return [...new Set([primary, ...requested.map((city) => city.trim())])]
    .filter((city) => valid.has(city)).slice(0, MAX_INTERVAL_CITIES);
}

export function updateDashboardState(manifest: Manifest, current: DashboardState, changes: Partial<DashboardState>): DashboardState {
  const next = { ...current, ...changes };
  const descriptor = manifest.datasets.find((dataset) => dataset.id === next.cityDatasetId)!;
  const mom = datasetForSelection(manifest, descriptor.houseType, descriptor.sizeBand, "环比") ?? descriptor;
  const interval = resolveIntervalSelection(manifest, mom, {
    ...next.intervalSelection,
    cities: comparisonCities(manifest, next.city, next.intervalSelection.cities),
  });
  const previous = current.intervalSelection;
  next.intervalSelection = interval.start === previous.start && interval.end === previous.end
    && interval.cities.join(",") === previous.cities.join(",") ? previous : interval;
  return next;
}
