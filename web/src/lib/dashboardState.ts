import type { DashboardSection, Manifest, TierFilter, TrendMode, TrendRange } from "../types";
import { datasetForSelection } from "./data";
import { resolveIntervalSelection, type IntervalSelection } from "./intervalIndex";

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
  indexHouseType: string;
  selectedCities: string[];
  trendMode: TrendMode;
  overallRange: TrendRange;
  cityRange: TrendRange;
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
  const indexHouseType = manifest.datasets.some((dataset) => dataset.houseType === params.get("indexHouse"))
    ? params.get("indexHouse")! : cityDescriptor.houseType;
  const intervalDescriptor = datasetForSelection(manifest, indexHouseType, cityDescriptor.sizeBand, "环比") ?? cityDescriptor;
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
  const city = [params.get("city"), params.get("cities")?.split(",")[0], DEFAULT_CITIES[0]]
    .find((name) => name && cities.has(name)) ?? manifest.cities[0]!.name;
  const cityPeriods = citySnapshotPeriods(manifest, cityDescriptor.sizeBand);
  const cityPeriod = params.get("cityPeriod");
  return {
    section: section === "history" || section === "cities" ? section : "overview",
    datasetId: descriptor.id,
    period: period && descriptor.periods.includes(period) ? period : descriptor.periods.at(-1)!,
    city,
    cityDatasetId: cityDescriptor.id,
    indexHouseType,
    cityPeriod: cityPeriod && cityPeriods.includes(cityPeriod) ? cityPeriod : cityPeriods.at(-1)!,
    selectedCities: params.has("cities")
      ? [...new Set((params.get("cities") ?? "").split(","))].filter((city) => cities.has(city)).slice(0, 10)
      : [city],
    trendMode: trend === "tier" || trend === "breadth" ? trend : "overall",
    overallRange: range("range", "10y"),
    cityRange: range("cityRange", "5y"),
    heatmapRange: range("heatmapRange", "3y"),
    heatmapTier: tier("heatmapTier"),
    overviewTier: tier("overviewTier"),
    intervalSelection: resolveIntervalSelection(manifest, intervalDescriptor, {
      cities: params.has("indexCities") ? (params.get("indexCities") || "").split(",").filter(Boolean)
        : params.has("indexCity") ? [params.get("indexCity")!] : [city],
      start: params.get("indexStart") ?? undefined,
      end: params.get("indexEnd") ?? undefined,
    }),
  };
}

export function dashboardSearch(manifest: Manifest, state: DashboardState, search = ""): string {
  const params = new URLSearchParams(search);
  const cityDescriptor = manifest.datasets.find((dataset) => dataset.id === state.cityDatasetId)!;
  const intervalDescriptor = datasetForSelection(manifest, state.indexHouseType, cityDescriptor.sizeBand, "环比") ?? cityDescriptor;
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
  set("indexHouse", state.indexHouseType, cityDescriptor.houseType);
  set("cityPeriod", state.cityPeriod, citySnapshotPeriods(manifest, cityDescriptor.sizeBand).at(-1));
  set("trend", state.trendMode, "overall");
  set("range", state.overallRange, "10y");
  set("cityRange", state.cityRange, "5y");
  set("heatmapRange", state.heatmapRange, "3y");
  set("heatmapTier", state.heatmapTier, "全部");
  set("overviewTier", state.overviewTier, "全部");
  set("cities", state.selectedCities.join(","), state.city);
  const defaultIndex = interval.cities.join(",") === defaultInterval.cities.join(",")
    && interval.start === defaultInterval.start && interval.end === defaultInterval.end;
  for (const [key, value] of [
    ["indexCities", interval.cities.join(",")], ["indexStart", interval.start], ["indexEnd", interval.end],
  ] as const) {
    if (defaultIndex) params.delete(key);
    else params.set(key, value);
  }
  params.delete("indexCity");
  params.delete("indexFill");
  return `?${params.toString()}`;
}

export function citySnapshotPeriods(manifest: Manifest, sizeBand: string): string[] {
  return [...new Set(manifest.datasets.filter((dataset) => dataset.sizeBand === sizeBand)
    .flatMap((dataset) => dataset.periods))].sort();
}
