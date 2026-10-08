import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { AppHeader } from "./components/AppHeader";
import { CitySearch } from "./components/CitySearch";
import { FilterDrawer } from "./components/FilterDrawer";
import type { FilterSelection } from "./components/FilterDrawer";
import { ScrollJump } from "./components/ScrollJump";
import { datasetForSelection, loadManifest, loadShard } from "./lib/data";
import { citySnapshotPeriods, dashboardSearch, readDashboardState, type DashboardState } from "./lib/dashboardState";
import type { DashboardSection, DatasetShard, Manifest } from "./types";

const DashboardContent = lazy(() => import("./components/DashboardContent"));
const CityContent = lazy(() => import("./components/CityContent"));
const CURRENT_YEAR = new Date().getFullYear();

interface LoadedShard {
  id: string;
  data: DatasetShard;
}

function Dashboard({ manifest }: { manifest: Manifest }) {
  const [state, setState] = useState(() => readDashboardState(manifest, window.location.search));
  const { section, datasetId, period, trendMode, overallRange } = state;
  const updateState = (next: Partial<DashboardState>) => setState((current) => ({ ...current, ...next }));
  const defaultDataset = useMemo(
    () => manifest.datasets.find((dataset) => dataset.id === manifest.defaultDataset) ?? manifest.datasets[0]!,
    [manifest],
  );
  const descriptor = manifest.datasets.find((dataset) => dataset.id === datasetId) ?? defaultDataset;
  const cityDescriptor = manifest.datasets.find((dataset) => dataset.id === state.cityDatasetId) ?? defaultDataset;
  const filterDescriptor = section === "cities" ? cityDescriptor : descriptor;
  const [loadedShard, setLoadedShard] = useState<LoadedShard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusCityRequest, setFocusCityRequest] = useState(0);

  useEffect(() => {
    if (section === "cities") return;
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
  }, [descriptor, section]);

  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${dashboardSearch(manifest, state, window.location.search)}${window.location.hash}`);
  }, [manifest, state]);

  useEffect(() => {
    const restore = () => {
      setState(readDashboardState(manifest, window.location.search));
      setFilterOpen(false);
      setSearchOpen(false);
    };
    window.addEventListener("popstate", restore);
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.removeEventListener("popstate", restore);
      window.history.scrollRestoration = previous;
    };
  }, [manifest]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [section, state.city]);

  const sectionHref = (next: DashboardSection) => `${window.location.pathname}${dashboardSearch(manifest, { ...state, section: next }, window.location.search)}`;
  const navigate = (nextSection: DashboardSection, changes: Partial<DashboardState> = {}) => {
    const next = { ...state, ...changes, section: nextSection };
    if (nextSection !== section || (nextSection === "cities" && next.city !== state.city)) {
      window.history.pushState(null, "", `${window.location.pathname}${dashboardSearch(manifest, next, window.location.search)}`);
    }
    setState(next);
  };

  const selection: FilterSelection = {
    period: section === "cities" ? state.cityPeriod : period,
    houseType: filterDescriptor.houseType,
    sizeBand: filterDescriptor.sizeBand,
    metric: filterDescriptor.metric,
  };

  const updateSelection = (next: Partial<FilterSelection>) => {
    if (section === "cities") {
      const sizeBand = next.sizeBand ?? cityDescriptor.sizeBand;
      const target = datasetForSelection(manifest, cityDescriptor.houseType, sizeBand, cityDescriptor.metric);
      const periods = citySnapshotPeriods(manifest, sizeBand);
      const candidate = next.period ?? state.cityPeriod;
      if (target) updateState({ cityDatasetId: target.id, cityPeriod: periods.includes(candidate) ? candidate : periods.at(-1)! });
      return;
    }
    const nextHouseType = next.houseType ?? descriptor.houseType;
    const nextSizeBand = next.sizeBand ?? descriptor.sizeBand;
    const nextMetric = next.metric ?? descriptor.metric;
    const target = datasetForSelection(manifest, nextHouseType, nextSizeBand, nextMetric);
    if (!target) return;
    const nextPeriod = next.period ?? period;
    updateState({ datasetId: target.id, period: target.periods.includes(nextPeriod) ? nextPeriod : target.periods.at(-1)! });
  };

  const defaultPeriod = defaultDataset.periods.at(-1)!;
  const activeFilterCount = (section === "cities" ? [
    cityDescriptor.sizeBand !== defaultDataset.sizeBand,
  ] : [
    section === "overview" && period !== defaultPeriod,
    descriptor.houseType !== defaultDataset.houseType,
    descriptor.sizeBand !== defaultDataset.sizeBand,
    descriptor.metric !== defaultDataset.metric,
  ]).filter(Boolean).length;
  const resetFilters = () => {
    if (section === "cities") {
      const target = datasetForSelection(manifest, cityDescriptor.houseType, defaultDataset.sizeBand, cityDescriptor.metric)!;
      const periods = citySnapshotPeriods(manifest, target.sizeBand);
      updateState({ cityDatasetId: target.id, cityPeriod: periods.includes(state.cityPeriod) ? state.cityPeriod : periods.at(-1)! });
      return;
    }
    updateState({ datasetId: defaultDataset.id, period: section === "overview" || !defaultDataset.periods.includes(period) ? defaultPeriod : period });
  };

  const shard = loadedShard?.id === descriptor.id ? loadedShard.data : null;
  const openCity = (city: string, context: Partial<DashboardState> = {}) => {
    setSearchOpen(false);
    navigate("cities", { ...context, city, selectedCities: [city], intervalSelection: { ...state.intervalSelection, cities: [city] } });
    setFocusCityRequest((value) => value + 1);
  };
  const openSearch = () => { setFilterOpen(false); setSearchOpen(true); };

  return (
    <div className="app-shell">
      <CitySearch cities={manifest.cities} open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={openCity} />
      <FilterDrawer
        manifest={manifest}
        dataset={filterDescriptor}
        selection={selection}
        open={filterOpen}
        showPeriod={section === "overview"}
        section={section}
        onClose={() => setFilterOpen(false)}
        onReset={resetFilters}
        onSelectionChange={updateSelection}
      />
      <AppHeader
        title="全国 70 城房价指数"
        filterOpen={filterOpen}
        activeFilterCount={activeFilterCount}
        onToggleFilter={() => setFilterOpen((value) => !value)}
        section={section}
        sectionHref={sectionHref}
        onSectionChange={navigate}
        searchOpen={searchOpen}
        onOpenSearch={openSearch}
      />

      <main className="app-main">
        {section === "cities" ? (
          <Suspense fallback={<div className="content-loader"><span /><span /><span /></div>}>
            <CityContent manifest={manifest} state={state} onChange={updateState} onOpenSearch={openSearch}
              focusRequest={focusCityRequest} />
          </Suspense>
        ) : <>
          {loadError && <div className="data-error" role="alert">{loadError}</div>}
          {!shard && !loadError && <div className="content-loader"><span /><span /><span /></div>}
          {shard && (
          <Suspense fallback={<div className="content-loader"><span /><span /><span /></div>}>
            <DashboardContent
              manifest={manifest}
              descriptor={descriptor}
              shard={shard}
              period={period}
              section={section}
              onViewCity={(city) => openCity(city, { cityDatasetId: descriptor.id, cityPeriod: period })}
              overviewTier={state.overviewTier}
              onOverviewTierChange={(overviewTier) => updateState({ overviewTier })}
              heatmapRange={state.heatmapRange}
              onHeatmapRangeChange={(heatmapRange) => updateState({ heatmapRange })}
              heatmapTier={state.heatmapTier}
              onHeatmapTierChange={(heatmapTier) => updateState({ heatmapTier })}
              trendMode={trendMode}
              onTrendModeChange={(trendMode) => updateState({ trendMode })}
              overallRange={overallRange}
              onOverallRangeChange={(overallRange) => updateState({ overallRange })}
            />
          </Suspense>
          )}
        </>}
      </main>
      <ScrollJump />
      <footer id="app-footer" className="app-footer">
        <span className="footer-copyright">
          © {CURRENT_YEAR}{" "}
          <a href="https://github.com/taifuer/house_price_index" target="_blank" rel="noreferrer">House Price Index</a>
        </span>
        <span className="footer-separator" aria-hidden="true">·</span>
        <span className="footer-source">
          {"数据来源于 "}
          <a href="https://www.stats.gov.cn/" target="_blank" rel="noreferrer">国家统计局</a>
          ，以官方发布为准
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
