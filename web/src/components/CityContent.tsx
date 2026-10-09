import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { datasetForSelection } from "../lib/data";
import type { DashboardState } from "../lib/dashboardState";
import { formatMetric, formatSizeBand } from "../lib/format";
import { reconcileCityColors } from "../lib/cityColors";
import { useCityData } from "../hooks/useCityData";
import type { Manifest } from "../types";
import { CitySnapshot } from "./CitySnapshot";
import { CityHistoryControls } from "./CityHistoryControls";
import { CityHistoryTable } from "./CityHistoryTable";
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
  const mom = datasetForSelection(manifest, descriptor.houseType, descriptor.sizeBand, "环比")!;
  const data = useCityData(manifest, descriptor.sizeBand);
  const shard = data.loaded[descriptor.id];
  const city = manifest.cities.find((item) => item.name === state.city)!;
  const selection = state.intervalSelection;
  const [assignments, setAssignments] = useState(() => reconcileCityColors(selection.cities, new Map()));
  const colors = useMemo(() => reconcileCityColors(selection.cities, assignments), [selection.cities, assignments]);
  useEffect(() => {
    if (colors.size !== assignments.size || [...colors].some(([city, color]) => assignments.get(city) !== color)) setAssignments(colors);
  }, [assignments, colors]);
  const pageRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusRequest) return;
    pageRef.current?.focus({ preventScroll: true });
  }, [focusRequest, state.city]);
  const updateSeries = (house: string, metric: string) => {
    const target = datasetForSelection(manifest, house, descriptor.sizeBand, metric);
    if (target) onChange({ cityDatasetId: target.id });
  };
  const onPeriodChange = (cityPeriod: string) => onChange({ cityPeriod });
  const metricControl = <FilterSelect aria-label="走势指标" value={descriptor.metric} onChange={(event) => updateSeries(descriptor.houseType, event.target.value)}>
    {manifest.dimensions.metrics.map((metric) => <option key={metric} value={metric}>{formatMetric(metric)}</option>)}
  </FilterSelect>;

  return <section ref={pageRef} className="dashboard-section city-data-page city-trend-anchor" data-section="cities" tabIndex={-1} aria-labelledby="city-page-title">
    <div className="section-heading city-page-heading">
      <h2 id="city-page-title"><button type="button" className="city-page-title" onClick={onOpenSearch} title="切换城市" aria-label={`切换城市，当前${city.name}`}>{city.name}<ChevronDown size={17} /></button></h2>
      <span className="city-page-tier">{city.tier}</span>
      <span className="section-title-meta">{descriptor.sizeBand === "全部" ? "全部面积" : formatSizeBand(descriptor.sizeBand)}</span>
    </div>
    <div className="section-content">
      <CitySnapshot manifest={manifest} city={city.name} period={state.cityPeriod} sizeBand={descriptor.sizeBand} {...data}
        onPeriodChange={onPeriodChange} onViewSeries={(cityDatasetId) => onChange({ cityDatasetId })} />
      <CityHistoryControls manifest={manifest} descriptor={mom} primaryCity={city.name} selection={selection} colors={colors}
        onHouseChange={(house) => updateSeries(house, descriptor.metric)} onChange={(intervalSelection) => onChange({ intervalSelection })} />
      <div className="city-series-anchor">
        {shard ? <CityTrendChart manifest={manifest} shard={shard} metric={descriptor.metric}
          filePrefix={`${descriptor.houseType}-${formatSizeBand(descriptor.sizeBand)}-${formatMetric(descriptor.metric)}`}
          subtitle={`${descriptor.houseType} · ${descriptor.sizeBand === "全部" ? "全部面积" : formatSizeBand(descriptor.sizeBand)} · ${formatMetric(descriptor.metric)}`}
          selection={selection} cityColors={colors} period={state.cityPeriod} onPeriodChange={onPeriodChange} selectionControls={metricControl} />
          : <div className="chart-block city-trend-chart"><div className="chart-heading-row"><h3>走势对比</h3>{metricControl}</div>
            {data.failures.includes(descriptor.id) ? <p className="data-error" role="alert">走势数据加载失败</p>
              : <div className="content-loader analysis-loader" aria-label="走势加载中"><span /><span /><span /></div>}
          </div>}
      </div>
      <IntervalIndexChart manifest={manifest} descriptor={mom} shard={data.loaded[mom.id]} failed={data.failures.includes(mom.id)}
        selection={selection} cityColors={colors} period={state.cityPeriod} onPeriodChange={onPeriodChange} />
      <CityHistoryTable manifest={manifest} city={city.name} houseType={descriptor.houseType} {...data}
        start={selection.start} end={selection.end} period={state.cityPeriod} onPeriodChange={onPeriodChange} />
    </div>
  </section>;
}
