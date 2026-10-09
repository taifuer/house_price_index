import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { citySnapshotPeriods } from "../lib/dashboardState";
import { formatMetric, formatPct, formatPeriod } from "../lib/format";
import { FilterSelect } from "./FilterSelect";
import type { DatasetDescriptor, DatasetShard, Manifest } from "../types";

interface CitySnapshotProps {
  manifest: Manifest;
  city: string;
  period: string;
  sizeBand: string;
  descriptors: DatasetDescriptor[];
  loaded: Record<string, DatasetShard>;
  failures: string[];
  onPeriodChange: (period: string) => void;
  onViewSeries: (datasetId: string) => void;
}

export function CitySnapshot({ manifest, city, period, sizeBand, descriptors, loaded, failures, onViewSeries, onPeriodChange }: CitySnapshotProps) {
  const cityIndex = manifest.cities.findIndex((item) => item.name === city);
  const sources = [...new Set(descriptors.flatMap((descriptor) => {
    const shard = loaded[descriptor.id];
    const source = shard?.sources[shard.periods.indexOf(period)];
    return source ? [source.url] : [];
  }))];
  const loading = descriptors.some((descriptor) => !loaded[descriptor.id] && !failures.includes(descriptor.id));
  const periods = useMemo(() => citySnapshotPeriods(manifest, sizeBand), [manifest, sizeBand]);
  const missing = descriptors.some((descriptor) => {
    const shard = loaded[descriptor.id];
    return shard && shard.values[shard.periods.indexOf(period)]?.[cityIndex] == null;
  });

  return (
    <div className="city-snapshot chart-block" aria-busy={loading}>
      <div className="chart-heading-row">
        <h3>当月表现</h3>
        <div className="snapshot-sources">
          <FilterSelect aria-label="当月表现月份" value={period} onChange={(event) => onPeriodChange(event.target.value)}>
            {[...periods].reverse().map((month) => <option key={month} value={month}>{formatPeriod(month)}</option>)}
          </FilterSelect>
          <div className="snapshot-source-links">
            {sources.map((url) => <a key={url} className="source-link" href={url} target="_blank" rel="noreferrer"
              aria-label="查看国家统计局原文" title="查看国家统计局原文"><ExternalLink size={16} /></a>)}
          </div>
        </div>
      </div>
      <table className="city-snapshot-table" aria-label={`${city}当月住宅价格变化`}>
        <thead><tr><th scope="col">住宅类型</th>{manifest.dimensions.metrics.map((metric) => <th key={metric} scope="col">{formatMetric(metric)}</th>)}</tr></thead>
        <tbody>{manifest.dimensions.houseTypes.map((houseType) => (
          <tr key={houseType}>
            <th scope="row">{houseType}</th>
            {manifest.dimensions.metrics.map((metric) => {
              const descriptor = descriptors.find((item) => item.houseType === houseType && item.metric === metric);
              const shard = descriptor && loaded[descriptor.id];
              const failed = descriptor && failures.includes(descriptor.id);
              const pending = descriptor && !shard && !failed;
              const value = shard?.values[shard.periods.indexOf(period)]?.[cityIndex];
              const change = value == null ? null : value - 100;
              return <td key={metric}>
                {change == null ? <span className="snapshot-unavailable" title={failed ? "加载失败" : pending ? "加载中" : "无数据"}>{failed ? "加载失败" : pending ? "..." : "—"}</span>
                  : <button type="button" className={`snapshot-value ${change > 0 ? "change-up" : change < 0 ? "change-down" : "change-flat"}`}
                    title={`查看${city}${houseType}${formatMetric(metric)}走势；当月指数 ${value!.toFixed(1)}`}
                    aria-label={`查看${city}${houseType}${formatMetric(metric)}走势`}
                    onClick={() => onViewSeries(descriptor!.id)}>{formatPct(change)}</button>}
              </td>;
            })}
          </tr>
        ))}</tbody>
      </table>
      {missing && <p className="trend-note">— 表示该月该指标无数据，不计作持平。</p>}
      {failures.length > 0 && <p className="trend-note" role="alert">部分指标加载失败，已保留其他可用数据。</p>}
    </div>
  );
}
