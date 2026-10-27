import { lazy, Suspense, useMemo } from "react";
import { MonthSelect } from "./MonthSelect";

import { cityDataForPeriod } from "../lib/data";
import { formatMetric, formatPeriod, formatSizeBand } from "../lib/format";
import type { DashboardSection, DatasetDescriptor, DatasetShard, Manifest, TierFilter, TrendMode, TrendRange } from "../types";
import { SummaryGrid } from "./SummaryGrid";
import {
  DistributionChart,
  ExtremeChart,
  CityOverview,
  TierComparisonChart,
} from "./charts/OverviewCharts";
import { OverallTrendChart } from "./charts/TrendCharts";

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
  onPeriodChange: (period: string) => void;
  section: DashboardSection;
  onViewCity: (city: string) => void;
  overviewTier: TierFilter;
  onOverviewTierChange: (tier: TierFilter) => void;
  heatmapRange: TrendRange;
  onHeatmapRangeChange: (range: TrendRange) => void;
  heatmapTier: TierFilter;
  onHeatmapTierChange: (tier: TierFilter) => void;
  trendMode: TrendMode;
  onTrendModeChange: (mode: TrendMode) => void;
  overallRange: TrendRange;
  onOverallRangeChange: (range: TrendRange) => void;
}

export default function DashboardContent({
  manifest,
  descriptor,
  shard,
  period,
  onPeriodChange,
  section,
  onViewCity,
  overviewTier,
  onOverviewTierChange,
  heatmapRange,
  onHeatmapRangeChange,
  heatmapTier,
  onHeatmapTierChange,
  trendMode,
  onTrendModeChange,
  overallRange,
  onOverallRangeChange,
}: DashboardContentProps) {
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
  const historyFilePrefix = `${descriptor.houseType}-${sizeBand}-${metric}`;
  const title = section === "overview" ? "价格概览" : "价格趋势";

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-section-title" data-section={section}>
      <div className="section-heading">
        <h2 id="dashboard-section-title" className="section-title">{title}</h2>
        <div className="section-meta-row">
          <span className="section-title-meta">{trendMeta}</span>
          {section === "overview" && <MonthSelect periods={descriptor.periods} value={period} onChange={onPeriodChange} label="概览月份" />}
        </div>
      </div>
      <div className="section-content">
        {section === "overview" && (
          <>
            <SummaryGrid data={cityData} manifest={manifest} sourceUrl={source?.url} />
            <CityOverview
              filePrefix={filePrefix}
              subtitle={overviewMeta}
              manifest={manifest}
              shard={shard}
              descriptor={descriptor}
              period={period}
              onViewCity={onViewCity}
              tier={overviewTier}
              onTierChange={onOverviewTierChange}
            />
            <div className="two-chart-grid">
              <ExtremeChart data={cityData} filePrefix={filePrefix} subtitle={overviewMeta} metric={descriptor.metric} />
              <DistributionChart data={cityData} filePrefix={filePrefix} subtitle={overviewMeta} metric={descriptor.metric} />
            </div>
            <TierComparisonChart data={cityData} filePrefix={filePrefix} subtitle={overviewMeta} metric={descriptor.metric} />
            <Suspense fallback={<div className="content-loader analysis-loader"><span /><span /><span /></div>}>
              <MonthlyComparisonView
                manifest={manifest}
                descriptor={descriptor}
                shard={shard}
                period={period}
                filePrefix={comparisonFilePrefix}
              />
            </Suspense>
          </>
        )}

        {section === "history" && (
          <>
            <OverallTrendChart
              manifest={manifest}
              shard={shard}
              filePrefix={historyFilePrefix}
              subtitle={trendMeta}
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
                period={shard.periods.at(-1)!}
                filePrefix={historyFilePrefix}
                range={heatmapRange}
                onRangeChange={onHeatmapRangeChange}
                tier={heatmapTier}
                onTierChange={onHeatmapTierChange}
              />
            </Suspense>
          </>
        )}

      </div>
    </section>
  );
}
