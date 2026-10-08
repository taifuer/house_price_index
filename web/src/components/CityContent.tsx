import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { datasetForSelection, loadShard } from "../lib/data";
import type { DashboardState } from "../lib/dashboardState";
import { formatMetric, formatSizeBand } from "../lib/format";
import { resolveIntervalSelection } from "../lib/intervalIndex";
import type { DatasetShard, Manifest } from "../types";
import { CitySnapshot } from "./CitySnapshot";
import { FilterSelect } from "./FilterSelect";
import { CityTrendChart } from "./charts/TrendCharts";
import { IntervalIndexChart } from "./charts/IntervalIndexChart";

interface CityContentProps {
  manifest: Manifest;
  state: DashboardState;
  onChange: (changes: Partial<DashboardState>) => void;
  onOpenSearch: () => void;
  focusRequest: number;
}

export default function CityContent({ manifest, state, onChange, onOpenSearch, focusRequest }: CityContentProps) {
  const descriptor = manifest.datasets.find((dataset) => dataset.id === state.cityDatasetId)!;
  const intervalDescriptor = datasetForSelection(manifest, state.indexHouseType, descriptor.sizeBand, "环比") ?? descriptor;
  const [loaded, setLoaded] = useState<DatasetShard | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [focusTrend, setFocusTrend] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const shard = loaded?.id === descriptor.id ? loaded : null;
  const city = manifest.cities.find((item) => item.name === state.city)!;
  const intervalSelection = useMemo(() => resolveIntervalSelection(manifest, intervalDescriptor, state.intervalSelection), [manifest, intervalDescriptor, state.intervalSelection]);

  useEffect(() => {
    let active = true;
    setError(null);
    loadShard(descriptor).then((data) => {
      if (active) setLoaded(data);
    }).catch((reason: unknown) => {
      if (active) setError({ id: descriptor.id, message: reason instanceof Error ? reason.message : "走势数据加载失败" });
    });
    return () => { active = false; };
  }, [descriptor]);
  useEffect(() => {
    if (!focusRequest) return;
    pageRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [focusRequest, state.city]);
  useEffect(() => {
    if (!focusTrend || !shard) return;
    trendRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    trendRef.current?.focus({ preventScroll: true });
    setFocusTrend(false);
  }, [focusTrend, shard]);
  const updateSeries = (houseType: string, metric: string) => {
    const target = datasetForSelection(manifest, houseType, descriptor.sizeBand, metric);
    if (target) onChange({ cityDatasetId: target.id });
  };
  const controls = (
    <div className="city-series-controls">
      <label><span>住宅类型</span><FilterSelect aria-label="走势住宅类型" value={descriptor.houseType} onChange={(event) => updateSeries(event.target.value, descriptor.metric)}>
        {manifest.dimensions.houseTypes.map((value) => <option key={value} value={value}>{value}</option>)}
      </FilterSelect></label>
      <label><span>指标</span><FilterSelect aria-label="走势指标" value={descriptor.metric} onChange={(event) => updateSeries(descriptor.houseType, event.target.value)}>
        {manifest.dimensions.metrics.map((value) => <option key={value} value={value}>{formatMetric(value)}</option>)}
      </FilterSelect></label>
    </div>
  );

  return (
    <section ref={pageRef} className="dashboard-section city-data-page city-trend-anchor" data-section="cities" tabIndex={-1} aria-labelledby="city-page-title">
      <div className="section-heading city-page-heading">
        <h2 id="city-page-title"><button type="button" className="city-page-title" onClick={onOpenSearch} title="切换城市" aria-label={`切换城市，当前${city.name}`}>{city.name}<ChevronDown size={17} /></button></h2>
        <span className="city-page-tier">{city.tier}</span>
        <span className="section-title-meta">{descriptor.sizeBand === "全部" ? "全部面积" : formatSizeBand(descriptor.sizeBand)}</span>
      </div>
      <div className="section-content">
        <CitySnapshot manifest={manifest} city={city.name} period={state.cityPeriod} sizeBand={descriptor.sizeBand}
          onPeriodChange={(cityPeriod) => onChange({ cityPeriod })}
          onViewSeries={(cityDatasetId) => {
            onChange({ cityDatasetId, selectedCities: [city.name] });
            setFocusTrend(true);
          }} />
        <div ref={trendRef} className="city-series-anchor" tabIndex={-1}>
          {shard ? <CityTrendChart manifest={manifest} shard={shard} metric={descriptor.metric}
            filePrefix={`${descriptor.houseType}-${formatSizeBand(descriptor.sizeBand)}-${formatMetric(descriptor.metric)}`}
            selectedCities={state.selectedCities} onSelectedCitiesChange={(selectedCities) => onChange({ selectedCities })}
            range={state.cityRange} onRangeChange={(cityRange) => onChange({ cityRange })}
            selectionControls={controls} />
            : <div className="chart-block city-trend-chart"><h3>走势对比</h3>{controls}
              {error?.id === descriptor.id ? <p className="data-error" role="alert">{error.message}</p>
                : <div className="content-loader analysis-loader" aria-label="走势加载中"><span /><span /><span /></div>}
            </div>}
        </div>
        <IntervalIndexChart manifest={manifest} descriptor={intervalDescriptor} shard={shard ?? undefined}
          selection={intervalSelection} onSelectionChange={(intervalSelection) => onChange({ intervalSelection })}
          housingControl={<div className="city-series-controls interval-series-controls"><label><span>住宅类型</span>
            <FilterSelect aria-label="区间指数住宅类型" value={state.indexHouseType}
              onChange={(event) => onChange({ indexHouseType: event.target.value })}>
              {manifest.dimensions.houseTypes.map((value) => <option key={value} value={value}>{value}</option>)}
            </FilterSelect>
          </label></div>} />
      </div>
    </section>
  );
}
