import { lazy, Suspense, useMemo } from "react";
import { ExternalLink } from "lucide-react";

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
          <span className="section-title-meta">{section === "overview" ? overviewMeta : trendMeta}</span>
          {section === "overview" && source && (
            <div className="section-actions section-action-group">
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
          )}
        </div>
      </div>
      <div className="section-content">
        {section === "overview" && (
          <>
            <SummaryGrid data={cityData} manifest={manifest} />
            <CityOverview
              filePrefix={filePrefix}
              manifest={manifest}
              shard={shard}
              descriptor={descriptor}
              period={period}
              onViewCity={onViewCity}
              tier={overviewTier}
              onTierChange={onOverviewTierChange}
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
          </>
        )}

        {section === "history" && (
          <>
            <OverallTrendChart
              manifest={manifest}
              shard={shard}
              filePrefix={historyFilePrefix}
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
