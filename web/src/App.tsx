import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { AppHeader } from "./components/AppHeader";
import { FilterDrawer } from "./components/FilterDrawer";
import type { FilterSelection } from "./components/FilterDrawer";
import { ScrollJump } from "./components/ScrollJump";
import { datasetForSelection, loadManifest, loadShard } from "./lib/data";
import type { DatasetDescriptor, DatasetShard, Manifest, TrendMode, TrendRange } from "./types";

const DashboardContent = lazy(() => import("./components/DashboardContent"));
const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_CITIES = ["北京", "上海", "广州", "深圳"];

function initialTrendRange(name: string, fallback: TrendRange): TrendRange {
  const value = new URLSearchParams(window.location.search).get(name);
  return value === "all" || value === "3y" || value === "5y" || value === "10y" ? value : fallback;
}

function initialTrendMode(): TrendMode {
  const value = new URLSearchParams(window.location.search).get("trend");
  return value === "tier" || value === "breadth" ? value : "overall";
}

function initialCities(manifest: Manifest): string[] {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("cities")) return DEFAULT_CITIES;
  const requested = params.get("cities") ?? "";
  const cityNames = new Set(manifest.cities.map((city) => city.name));
  const selected = [...new Set(requested.split(","))].filter((city) => cityNames.has(city)).slice(0, 10);
  return selected;
}

interface LoadedShard {
  id: string;
  data: DatasetShard;
}

function initialDataset(manifest: Manifest): DatasetDescriptor {
  const requested = new URLSearchParams(window.location.search).get("view");
  return manifest.datasets.find((dataset) => dataset.id === requested)
    ?? manifest.datasets.find((dataset) => dataset.id === manifest.defaultDataset)
    ?? manifest.datasets[0]!;
}

function Dashboard({ manifest }: { manifest: Manifest }) {
  const firstDataset = useMemo(() => initialDataset(manifest), [manifest]);
  const defaultDataset = useMemo(
    () => manifest.datasets.find((dataset) => dataset.id === manifest.defaultDataset) ?? manifest.datasets[0]!,
    [manifest],
  );
  const [datasetId, setDatasetId] = useState(firstDataset.id);
  const descriptor = manifest.datasets.find((dataset) => dataset.id === datasetId) ?? firstDataset;
  const requestedPeriod = new URLSearchParams(window.location.search).get("period");
  const [period, setPeriod] = useState(
    requestedPeriod && descriptor.periods.includes(requestedPeriod)
      ? requestedPeriod
      : descriptor.periods.at(-1)!,
  );
  const [loadedShard, setLoadedShard] = useState<LoadedShard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCities, setSelectedCities] = useState(() => initialCities(manifest));
  const [trendMode, setTrendMode] = useState<TrendMode>(initialTrendMode);
  const [overallRange, setOverallRange] = useState<TrendRange>(() => initialTrendRange("range", "10y"));
  const [cityRange, setCityRange] = useState<TrendRange>(() => initialTrendRange("cityRange", "5y"));

  useEffect(() => {
    let active = true;
    setLoadError(null);
    loadShard(descriptor)
      .then((data) => {
        if (active) setLoadedShard({ id: descriptor.id, data });
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "数据加载失败");
      });
    return () => {
      active = false;
    };
  }, [descriptor]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", descriptor.id);
    params.set("period", period);
    if (trendMode === "overall") params.delete("trend");
    else params.set("trend", trendMode);
    if (overallRange === "10y") params.delete("range");
    else params.set("range", overallRange);
    if (cityRange === "5y") params.delete("cityRange");
    else params.set("cityRange", cityRange);
    if (selectedCities.join(",") === DEFAULT_CITIES.join(",")) params.delete("cities");
    else params.set("cities", selectedCities.join(","));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }, [cityRange, descriptor.id, overallRange, period, selectedCities, trendMode]);

  const selection: FilterSelection = {
    period,
    houseType: descriptor.houseType,
    sizeBand: descriptor.sizeBand,
    metric: descriptor.metric,
  };

  const updateSelection = (next: Partial<FilterSelection>) => {
    if (next.period) setPeriod(next.period);
    const nextHouseType = next.houseType ?? descriptor.houseType;
    const nextSizeBand = next.sizeBand ?? descriptor.sizeBand;
    const nextMetric = next.metric ?? descriptor.metric;
    const target = datasetForSelection(manifest, nextHouseType, nextSizeBand, nextMetric);
    if (!target || target.id === descriptor.id) return;
    setDatasetId(target.id);
    if (!target.periods.includes(next.period ?? period)) setPeriod(target.periods.at(-1)!);
  };

  const defaultPeriod = defaultDataset.periods.at(-1)!;
  const activeFilterCount = [
    period !== defaultPeriod,
    descriptor.houseType !== defaultDataset.houseType,
    descriptor.sizeBand !== defaultDataset.sizeBand,
    descriptor.metric !== defaultDataset.metric,
  ].filter(Boolean).length;
  const resetFilters = () => {
    setDatasetId(defaultDataset.id);
    setPeriod(defaultPeriod);
  };

  const shard = loadedShard?.id === descriptor.id ? loadedShard.data : null;

  return (
    <div className="app-shell">
      <FilterDrawer
        manifest={manifest}
        dataset={descriptor}
        selection={selection}
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onReset={resetFilters}
        onSelectionChange={updateSelection}
      />
      <AppHeader
        title={manifest.title}
        filterOpen={filterOpen}
        activeFilterCount={activeFilterCount}
        onToggleFilter={() => setFilterOpen((value) => !value)}
      />

      <main className="app-main">
        {loadError && <div className="data-error" role="alert">{loadError}</div>}
        {!shard && !loadError && <div className="content-loader"><span /><span /><span /></div>}
        {shard && (
          <Suspense fallback={<div className="content-loader"><span /><span /><span /></div>}>
            <DashboardContent
              manifest={manifest}
              descriptor={descriptor}
              shard={shard}
              period={period}
              selectedCities={selectedCities}
              onSelectedCitiesChange={setSelectedCities}
              trendMode={trendMode}
              onTrendModeChange={setTrendMode}
              overallRange={overallRange}
              onOverallRangeChange={setOverallRange}
              cityRange={cityRange}
              onCityRangeChange={setCityRange}
            />
          </Suspense>
        )}
      </main>
      <ScrollJump />
      <footer id="app-footer" className="app-footer">
        <span className="footer-copyright">
          © {CURRENT_YEAR}{" "}
          <a href="https://github.com/taifuer/house_price_index" target="_blank" rel="noreferrer">House Price Index</a>
        </span>
        <span className="footer-source">
          {" · 数据来源于 "}
          <a href="https://www.stats.gov.cn/" target="_blank" rel="noreferrer">国家统计局</a>
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "页面数据加载失败"));
  }, []);

  if (error) return <div className="fatal-error" role="alert">{error}</div>;
  if (!manifest) return <div className="initial-loader" aria-label="页面加载中"><span /><span /><span /></div>;
  return <Dashboard manifest={manifest} />;
}
