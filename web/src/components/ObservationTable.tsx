import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChartNoAxesCombined, ExternalLink } from "lucide-react";

import type { DatasetDescriptor } from "../types";
import { formatMetric, formatPct, formatSizeBand } from "../lib/format";
import { sortObservations } from "../lib/observations";
import type { Observation, ObservationSort, ObservationSortKey } from "../lib/observations";

interface ObservationTableProps {
  rows: Observation[];
  descriptor: DatasetDescriptor;
  history?: boolean;
  onViewCity?: (city: string) => void;
}

export function ObservationTable({ rows, descriptor, history = false, onViewCity }: ObservationTableProps) {
  const [sort, setSort] = useState<ObservationSort>({ key: history ? "period" : "change", direction: "desc" });
  const sorted = useMemo(() => sortObservations(rows, sort), [rows, sort]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sorted]);
  const metric = formatMetric(descriptor.metric);
  const label = history ? "城市历史数据" : "当月城市数据";
  const columns: Array<{ key: ObservationSortKey; label: string; numeric?: boolean }> = [
    ...(history ? [{ key: "period" as const, label: "月份" }] : []),
    { key: "city", label: "城市" },
    { key: "value", label: `${metric}指数`, numeric: true },
    { key: "change", label: "涨跌幅", numeric: true },
    ...(!history ? [{ key: "tier" as const, label: "层级" }] : []),
  ];
  const indexBase = descriptor.metric === "环比" ? "上月 = 100"
    : descriptor.metric === "同比" ? "上年同月 = 100" : "上年同期 = 100";
  const updateSort = (key: ObservationSortKey) => {
    setSort((previous) => ({
      key,
      direction: previous.key === key
        ? previous.direction === "desc" ? "asc" : "desc"
        : key === "city" || key === "tier" ? "asc" : "desc",
    }));
  };
  const scope = `${descriptor.houseType} · ${formatSizeBand(descriptor.sizeBand)} · ${metric}`;
  const periodLabel = history ? `${rows[0]?.period ?? ""} 至 ${rows.at(-1)?.period ?? ""}` : rows[0]?.period;

  return (
    <div className={`observation-table${history ? " is-history" : ""}`}>
      <div className="data-table-toolbar">
        <p className="data-table-scope">{scope} · {periodLabel}</p>
        <span className="data-table-count" role="status">共 {sorted.length} 条</span>
      </div>
      <div ref={scrollRef} className="data-table-scroll" role="region" aria-label={`${label}表格`} tabIndex={0}>
        <table aria-label={label}>
          <colgroup>
            {columns.map((column) => <col key={column.key} className={`data-column-${column.key}`} />)}
            <col className="data-column-source" />
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.numeric ? "numeric" : column.key === "tier" ? "data-tier" : undefined} aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
                  <button type="button" onClick={() => updateSort(column.key)} title={column.key === "value" ? indexBase : undefined}>
                    <span>{column.label}</span>
                    {sort.key !== column.key ? <ArrowUpDown size={13} /> : sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                  </button>
                </th>
              ))}
              <th className="data-source" scope="col">来源</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={`${row.period}-${row.city}`}>
                {history && <th scope="row">{row.period}</th>}
                {history ? <td>{row.city}</td> : (
                  <th scope="row">
                    {onViewCity ? (
                      <button className="data-city-link" type="button" title={`查看${row.city}走势`} aria-label={`查看${row.city}走势`} onClick={() => onViewCity(row.city)}>
                        {row.city}<ChartNoAxesCombined size={15} aria-hidden="true" />
                      </button>
                    ) : row.city}
                  </th>
                )}
                <td className="numeric" title={row.value == null ? "暂无数据" : undefined}>
                  <span className="data-number">{row.value == null ? "—" : row.value.toFixed(1)}</span>
                </td>
                <td className={`numeric ${row.change == null ? "" : row.change > 0 ? "change-up" : row.change < 0 ? "change-down" : "change-flat"}`} title={row.change == null ? "暂无数据" : undefined}>
                  <span className="data-number">{row.change == null ? "—" : formatPct(row.change)}</span>
                </td>
                {!history && <td className="data-tier">{row.tier}</td>}
                <td className="data-source">
                  {row.source?.url ? (
                    <a className="source-link" href={row.source.url} target="_blank" rel="noreferrer" title={row.source.title} aria-label={`查看${row.period}统计局原文`}><ExternalLink size={15} /></a>
                  ) : "—"}
                </td>
              </tr>
            ))}
            {!sorted.length && <tr><td className="data-table-empty" colSpan={columns.length + 1}>没有匹配的数据</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
