import { useMemo } from "react";
import { ExternalLink } from "lucide-react";

import { cityDataForPeriod } from "../lib/data";
import { formatPeriod, formatSizeBand } from "../lib/format";
import type { DatasetDescriptor, DatasetShard, Manifest } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";
import { SummaryGrid } from "./SummaryGrid";
import {
  DistributionChart,
  ExtremeChart,
  RankingChart,
  TierComparisonChart,
} from "./charts/OverviewCharts";
import { CityTrendChart, OverallTrendChart } from "./charts/TrendCharts";

interface DashboardContentProps {
  manifest: Manifest;
  descriptor: DatasetDescriptor;
  shard: DatasetShard;
  period: string;
  selectedCities: string[];
  onSelectedCitiesChange: (cities: string[]) => void;
}

export default function DashboardContent({
  manifest,
  descriptor,
  shard,
  period,
  selectedCities,
  onSelectedCitiesChange,
}: DashboardContentProps) {
  const cityData = useMemo(() => cityDataForPeriod(manifest, shard, period), [manifest, period, shard]);
  const periodIndex = shard.periods.indexOf(period);
  const source = shard.sources[periodIndex];
  const sizeBand = formatSizeBand(descriptor.sizeBand);
  const overviewTitle = `价格概览 · ${descriptor.houseType} · ${sizeBand} · ${descriptor.metric} · ${formatPeriod(period)}`;
  const trendTitle = `价格趋势 · ${descriptor.houseType} · ${sizeBand} · ${descriptor.metric}`;
  const filePrefix = `${formatPeriod(period)}-${descriptor.houseType}-${sizeBand}-${descriptor.metric}`;

  return (
    <>
      <CollapsibleSection
        title={overviewTitle}
        actions={source && (
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
        )}
      >
        <SummaryGrid data={cityData} />
        <RankingChart data={cityData} filePrefix={filePrefix} />
        <div className="two-chart-grid">
          <ExtremeChart data={cityData} filePrefix={filePrefix} />
          <DistributionChart data={cityData} filePrefix={filePrefix} />
        </div>
        <TierComparisonChart data={cityData} filePrefix={filePrefix} />
      </CollapsibleSection>

      <CollapsibleSection title={trendTitle}>
        <OverallTrendChart manifest={manifest} shard={shard} filePrefix={filePrefix} />
        <CityTrendChart
          manifest={manifest}
          shard={shard}
          filePrefix={filePrefix}
          selectedCities={selectedCities}
          onSelectedCitiesChange={onSelectedCitiesChange}
        />
      </CollapsibleSection>
    </>
  );
}
