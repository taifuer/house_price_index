import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { historicalObservation } from "../lib/cityHistory";
import { completeMonths, formatMetric, formatPct } from "../lib/format";
import type { DatasetDescriptor, DatasetShard, Manifest } from "../types";

interface CityHistoryTableProps {
  manifest: Manifest;
  city: string;
  houseType: string;
  descriptors: DatasetDescriptor[];
  loaded: Record<string, DatasetShard>;
  failures: string[];
  start: string;
  end: string;
  period: string;
  onPeriodChange: (period: string) => void;
}

const PAGE_SIZE = 12;

export function CityHistoryTable({ manifest, city, houseType, descriptors, loaded, failures, start, end, period, onPeriodChange }: CityHistoryTableProps) {
  const periods = useMemo(() => completeMonths(start, end).reverse(), [start, end]);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(periods.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => {
    const index = periods.indexOf(period);
    setPage(index < 0 ? 0 : Math.floor(index / PAGE_SIZE));
  }, [city, houseType, period, periods]);
  const cityIndex = manifest.cities.findIndex((item) => item.name === city);
  const columns = manifest.dimensions.metrics.map((metric) => ({
    metric, descriptor: descriptors.find((dataset) => dataset.houseType === houseType && dataset.metric === metric),
  }));
  const loading = columns.some(({ descriptor }) => descriptor && !loaded[descriptor.id] && !failures.includes(descriptor.id));
  const failed = columns.some(({ descriptor }) => descriptor && failures.includes(descriptor.id));

  return <section className="chart-block city-history-table" aria-labelledby="city-history-title" aria-busy={loading}>
    <div className="chart-heading-row history-table-heading">
      <h3 id="city-history-title">历史明细</h3>
      <span className="interval-meta">{city} · {houseType}</span>
    </div>
    <table aria-label={`${city}${houseType}历史明细`}>
      <thead><tr><th scope="col">月份</th>{columns.map(({ metric }) => <th key={metric} scope="col">{formatMetric(metric)}</th>)}</tr></thead>
      <tbody>{periods.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((month) => <tr key={month} data-period={month} className={month === period ? "is-selected" : undefined}>
        <th scope="row"><button type="button" aria-label={`查看${month}当月表现`} aria-pressed={month === period} onClick={() => onPeriodChange(month)}>{month}</button></th>
        {columns.map(({ metric, descriptor }) => {
          const cell = historicalObservation(descriptor, loaded, failures, cityIndex, month);
          return <td key={metric} className={cell.change == null ? "history-unavailable" : cell.change > 0 ? "change-up" : cell.change < 0 ? "change-down" : "change-flat"}
            title={cell.status === "failed" ? "加载失败" : cell.status === "loading" ? "加载中" : cell.status === "missing" ? "无数据" : undefined}>
            {cell.change == null ? cell.status === "loading" ? "..." : cell.status === "failed" ? "加载失败" : "—" : formatPct(cell.change)}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
    <div className="history-table-pagination">
      <span>共 {periods.length} 个月</span>
      <div role="group" aria-label="历史明细分页">
        <button type="button" className="header-tool" title="上一页" aria-label="上一页" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
        <span aria-live="polite">{currentPage + 1} / {pageCount}</span>
        <button type="button" className="header-tool" title="下一页" aria-label="下一页" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
      </div>
    </div>
    <p className="trend-note">— 表示无数据，不计作持平。累计平均同比为当年累计平均价格与上年同期的比较。</p>
    {failed && <p className="trend-note" role="alert">部分指标加载失败，未以缺失或持平替代。</p>}
  </section>;
}
