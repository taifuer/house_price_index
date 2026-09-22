import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import { cityDataForPeriod } from "../lib/data";
import { formatMetric, formatPeriod, formatSizeBand } from "../lib/format";
import type { IntervalSelection } from "../lib/intervalIndex";
import type { DatasetDescriptor, DatasetShard, Manifest, TrendMode, TrendRange } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";
import type { DataView } from "./DataViewToggle";
import { SummaryGrid } from "./SummaryGrid";
import {
  DistributionChart,
  ExtremeChart,
  RankingChart,
  TierComparisonChart,
} from "./charts/OverviewCharts";
import { CityTrendChart, OverallTrendChart } from "./charts/TrendCharts";
import { IntervalIndexChart } from "./charts/IntervalIndexChart";

const CityMonthlyView = lazy(() => import("./charts/AdvancedCharts").then((module) => ({
  default: module.CityMonthlyView,
})));
const MonthlyComparisonView = lazy(() => import("./charts/AdvancedCharts").then((module) => ({
  default: module.MonthlyComparisonView,
})));

interface DashboardContentProps {
  manifest: Manifest;
  descriptor: DatasetDescriptor;
  shard: DatasetShard;
  period: string;
  rankingView: DataView;
  onRankingViewChange: (view: DataView) => void;
  cityView: DataView;
  onCityViewChange: (view: DataView) => void;
  selectedCities: string[];
  onSelectedCitiesChange: (cities: string[]) => void;
  trendMode: TrendMode;
  onTrendModeChange: (mode: TrendMode) => void;
  overallRange: TrendRange;
  onOverallRangeChange: (range: TrendRange) => void;
  cityRange: TrendRange;
  onCityRangeChange: (range: TrendRange) => void;
  intervalSelection: IntervalSelection;
  onIntervalSelectionChange: (selection: IntervalSelection) => void;
}

export default function DashboardContent({
  manifest,
  descriptor,
  shard,
  period,
  rankingView,
  onRankingViewChange,
  cityView,
  onCityViewChange,
  selectedCities,
  onSelectedCitiesChange,
  trendMode,
  onTrendModeChange,
  overallRange,
  onOverallRangeChange,
  cityRange,
  onCityRangeChange,
  intervalSelection,
  onIntervalSelectionChange,
}: DashboardContentProps) {
  const [trendOpen, setTrendOpen] = useState(true);
  const [focusCityTrend, setFocusCityTrend] = useState(false);
  const cityTrendRef = useRef<HTMLDivElement>(null);
  const viewCity = (city: string) => {
    onSelectedCitiesChange([city]);
    setTrendOpen(true);
    onCityViewChange("chart");
    setFocusCityTrend(true);
  };
  useEffect(() => {
    if (!focusCityTrend || !cityTrendRef.current) return;
    cityTrendRef.current.focus({ preventScroll: true });
    cityTrendRef.current.scrollIntoView({ block: "start" });
    setFocusCityTrend(false);
  }, [focusCityTrend]);
  const cityData = useMemo(() => cityDataForPeriod(manifest, shard, period), [manifest, period, shard]);
  const periodIndex = shard.periods.indexOf(period);
  const source = shard.sources[periodIndex];
  const sizeBand = formatSizeBand(descriptor.sizeBand);
  const metric = formatMetric(descriptor.metric);
  const scope = descriptor.sizeBand === "全部"
    ? [descriptor.houseType]
    : [descriptor.houseType, sizeBand];
  const overviewMeta = [...scope, metric, formatPeriod(period)].join(" · ");
  const trendMeta = [...scope, metric].join(" · ");
  const filePrefix = `${formatPeriod(period)}-${descriptor.houseType}-${sizeBand}-${metric}`;
  const comparisonFilePrefix = `${formatPeriod(period)}-${descriptor.houseType}-${sizeBand}`;

  return (
    <>
      <CollapsibleSection
        title="价格概览"
        meta={overviewMeta}
        actions={(
          source && (
            <div className="section-action-group">
              <a
                className="source-link"
                href={source.url}
                target="_blank"
                rel="noreferrer"
                title="查看国家统计局原文"
                aria-label="查看国家统计局原文"
              >
                <ExternalLink size={17} />
              </a>
            </div>
          )
        )}
      >
        <SummaryGrid data={cityData} manifest={manifest} />
        <RankingChart
          data={cityData}
          filePrefix={filePrefix}
          metric={descriptor.metric}
          manifest={manifest}
          shard={shard}
          descriptor={descriptor}
          period={period}
          view={rankingView}
          onViewChange={onRankingViewChange}
          onViewCity={viewCity}
        />
        <div className="two-chart-grid">
          <ExtremeChart data={cityData} filePrefix={filePrefix} metric={descriptor.metric} />
          <DistributionChart data={cityData} filePrefix={filePrefix} metric={descriptor.metric} />
        </div>
        <TierComparisonChart data={cityData} filePrefix={filePrefix} metric={descriptor.metric} />
        <Suspense fallback={<div className="content-loader analysis-loader"><span /><span /><span /></div>}>
          <MonthlyComparisonView
            manifest={manifest}
            descriptor={descriptor}
            shard={shard}
            period={period}
            filePrefix={comparisonFilePrefix}
          />
        </Suspense>
      </CollapsibleSection>

      <CollapsibleSection title="价格趋势" meta={trendMeta} open={trendOpen} onOpenChange={setTrendOpen}>
        <OverallTrendChart
          manifest={manifest}
          shard={shard}
          filePrefix={filePrefix}
          metric={descriptor.metric}
          mode={trendMode}
          range={overallRange}
          onModeChange={onTrendModeChange}
          onRangeChange={onOverallRangeChange}
        />
        <Suspense fallback={<div className="content-loader analysis-loader"><span /><span /><span /></div>}>
          <CityMonthlyView
            manifest={manifest}
            descriptor={descriptor}
            shard={shard}
            period={period}
            filePrefix={filePrefix}
          />
        </Suspense>
        <div ref={cityTrendRef} className="city-trend-anchor" tabIndex={-1} aria-label="城市走势及历史数据">
          <CityTrendChart
            descriptor={descriptor}
            view={cityView}
            onViewChange={onCityViewChange}
            manifest={manifest}
            shard={shard}
            filePrefix={filePrefix}
            metric={descriptor.metric}
            selectedCities={selectedCities}
            onSelectedCitiesChange={onSelectedCitiesChange}
            range={cityRange}
            onRangeChange={onCityRangeChange}
          />
        </div>
        <IntervalIndexChart
          manifest={manifest}
          descriptor={descriptor}
          shard={shard}
          selection={intervalSelection}
          onSelectionChange={onIntervalSelectionChange}
        />
      </CollapsibleSection>
    </>
  );
}
