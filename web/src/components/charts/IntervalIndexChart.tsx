import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "../EChart";
import { ChartPanel } from "../ChartPanel";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { axisLabelStyle, COLORS, splitLineStyle } from "../../lib/chartTheme";
import { completeMonths, formatPct, formatPeriod, formatSizeBand, summarizePeriodRanges } from "../../lib/format";
import { buildIntervalIndex, groupIntervalMissingPeriods, intervalLineSegments, type IntervalSelection } from "../../lib/intervalIndex";
import type { DatasetDescriptor, DatasetShard, Manifest } from "../../types";

interface IntervalIndexChartProps {
  manifest: Manifest;
  descriptor: DatasetDescriptor;
  shard?: DatasetShard;
  failed: boolean;
  selection: IntervalSelection;
  cityColors: ReadonlyMap<string, string>;
  period: string;
  onPeriodChange: (period: string) => void;
}

export function IntervalIndexChart({ manifest, descriptor, shard: momShard, failed, selection, cityColors, period, onPeriodChange }: IntervalIndexChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const loadError = failed ? "环比数据加载失败" : null;
  const periods = useMemo(() => completeMonths(selection.start, selection.end), [selection.start, selection.end]);
  const results = useMemo(() => momShard
    ? selection.cities.map((city) => ({ city, ...buildIntervalIndex(momShard,
      manifest.cities.findIndex((item) => item.name === city), selection.start, selection.end, true) }))
    : null, [manifest, momShard, selection]);
  const multiple = selection.cities.length > 1;
  const result = results?.[0];
  const endIndex = result?.endIndex ?? null;
  const change = endIndex == null ? null : endIndex - 100;
  const imputedCount = result?.imputedPeriods.length ?? 0;
  const imputedCities = results?.filter((item) => item.imputedPeriods.length).map((item) => item.city) ?? [];
  const missingGroups = groupIntervalMissingPeriods(results ?? []);
  const estimateLabel = imputedCities.length ? "（含持平填补）" : "";
  const scope = [descriptor.houseType, ...(descriptor.sizeBand === "全部" ? [] : [formatSizeBand(descriptor.sizeBand)])].join(" · ");

  const option = useMemo<EChartsCoreOption>(() => {
    const points = results?.[0]?.points ?? [];
    const indices = results?.flatMap((item) => item.points.flatMap((point) => point.index == null ? [] : [point.index])) ?? [];
    const estimatedCities = new Set(results?.filter((item) => item.imputedPeriods.length).map((item) => item.city));
    const minimum = Math.min(100, ...indices);
    const maximum = Math.max(100, ...indices);
    const padding = Math.max(1, (maximum - minimum) * 0.08);
    const roughInterval = (maximum - minimum + padding * 2) / 5;
    const magnitude = 10 ** Math.floor(Math.log10(roughInterval));
    const interval = Math.max(1, ([1, 2, 5, 10].find((step) => step * magnitude >= roughInterval) ?? 10) * magnitude);
    const labelCount = Math.min(points.length, isMobile ? 3 : 6);
    const labelIndexes = new Set(Array.from({ length: labelCount }, (_, index) =>
      labelCount < 2 ? 0 : Math.round(index * (points.length - 1) / (labelCount - 1))));
    return {
      animationDuration: 250,
      aria: { enabled: true, description: `${selection.cities.join("、")}从${formatPeriod(selection.start)}至${formatPeriod(selection.end)}的区间指数，起点为100，按公开环比连乘估算${estimatedCities.size ? "，缺失数据按持平填补，后续累计值均含填补假设" : ""}` },
      title: estimatedCities.size ? {
        text: `含持平填补：${multiple ? `${estimatedCities.size}城` : `${imputedCount}个月`}`,
        left: isMobile ? 42 : 54,
        top: 4,
        textStyle: { color: COLORS.muted, fontSize: 12, fontWeight: "normal" },
      } : undefined,
      legend: multiple ? {
        type: "scroll", bottom: 4, left: "center",
        data: selection.cities,
        itemWidth: 14, itemHeight: 8, pageIconSize: 10,
        pageIconColor: COLORS.muted, pageIconInactiveColor: COLORS.missing,
        pageTextStyle: axisLabelStyle, textStyle: axisLabelStyle,
        formatter: (city: string) => `${city}${estimatedCities.has(city) ? "*" : ""}`,
      } : undefined,
      grid: { left: isMobile ? 42 : 54, right: 20, top: 32, bottom: multiple ? 64 : 40 },
      tooltip: {
        trigger: "axis",
        confine: true,
        borderColor: "#d0d5dd",
        axisPointer: {
          type: "cross",
          animation: false,
          label: { show: false },
          lineStyle: { type: "dashed", color: COLORS.flat, width: 1 },
          crossStyle: { type: "dashed", color: COLORS.flat, width: 1 },
        },
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : [raw]) as { dataIndex: number; seriesName: string; value: unknown }[];
          const item = items.find((item) => typeof item.value === "number");
          if (!item) return "";
          const point = points[item.dataIndex];
          if (point?.index == null) return "";
          if (multiple) {
            // Each city may have several solid/dashed series; show just one row per visible city.
            const visibleCities = new Set(items.filter((item) => typeof item.value === "number").map((item) => item.seriesName));
            const visible = (results ?? []).filter((result) => visibleCities.has(result.city));
            const rows = visible.map((result) => {
              const value = result.points[item.dataIndex]!;
              const monthly = value.imputed ? "缺失" : value.mom == null ? "--" : formatPct(value.mom - 100);
              return `<tr><th><span class="city-color-swatch" style="background-color:${cityColors.get(result.city)}"></span>${result.city}${value.estimated ? "*" : ""}</th><td>${value.index!.toFixed(1)}</td><td>${formatPct(value.index! - 100)}</td><td>${monthly}</td></tr>`;
            }).join("");
            return `<div class="interval-tooltip">${formatPeriod(point.period)}<table><thead><tr><th>城市</th><th>指数</th><th>累计涨跌</th><th>当月环比</th></tr></thead><tbody>${rows}</tbody></table>${visible.some((result) => result.points[item.dataIndex]?.estimated) ? "<small>* 含持平填补</small>" : ""}</div>`;
          }
          const monthly = point.imputed ? "当月环比缺失，按持平填补" : point.mom == null ? "基准月" : `当月环比 ${formatPct(point.mom - 100)}`;
          return `${formatPeriod(point.period)} · ${selection.cities[0]}<br/>区间指数 ${point.index.toFixed(1)}${point.estimated ? "（含持平填补）" : ""}<br/>相对起点 ${formatPct(point.index - 100)}<br/>${monthly}`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: points.length === 1,
        data: points.map((point) => point.period),
        axisLine: { lineStyle: { color: "#cbd5e1" } },
        axisTick: { show: false },
        axisLabel: {
          ...axisLabelStyle,
          interval: (index: number) => labelIndexes.has(index),
          showMinLabel: true,
          showMaxLabel: true,
          hideOverlap: true,
          alignMinLabel: "left",
          alignMaxLabel: "right",
          formatter: (period: string) => isMobile ? `${period.slice(2, 4)}年${Number(period.slice(5))}月` : formatPeriod(period),
        },
      },
      yAxis: {
        type: "value",
        min: Math.floor((minimum - padding) / interval) * interval,
        max: Math.ceil((maximum + padding) / interval) * interval,
        interval,
        axisLabel: axisLabelStyle,
        splitLine: { lineStyle: splitLineStyle },
      },
      series: [...(results ?? []).flatMap((result) => intervalLineSegments(result.points).map((segment) => ({
        name: result.city,
        type: "line",
        data: segment.data,
        connectNulls: false,
        showSymbol: points.length === 1,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2.2, color: cityColors.get(result.city), type: segment.imputed ? "dashed" : "solid" },
        itemStyle: { color: cityColors.get(result.city) },
        emphasis: { disabled: true },
      }))), {
        name: "基准", type: "line", data: [], silent: true,
        tooltip: { show: false },
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { type: "dashed", color: COLORS.baseline, width: 1 },
          data: [{ yAxis: 100 }],
        },
      }],
    };
  }, [cityColors, imputedCount, isMobile, multiple, results, selection]);

  return (
    <ChartPanel className="interval-index-chart" title="区间指数"
      subtitle={`${selection.cities.join("、")} · ${scope} · ${selection.start} - ${selection.end} · 环比连乘 · 起点 = 100${estimateLabel}`}
      fileName={`${selection.cities.join("-")}-${descriptor.houseType}-${formatSizeBand(descriptor.sizeBand)}-${selection.start}-${selection.end}-区间指数${estimateLabel}`}
      notes={[
        ...(results ?? []).map((item) => `${item.city}：终点指数 ${item.endIndex?.toFixed(1) ?? "--"}，区间累计涨跌 ${item.endIndex == null ? "--" : formatPct(item.endIndex - 100)}${item.imputedPeriods.length ? "（含持平填补）" : ""}。`),
        ...missingGroups.map((group) => `${group.cities.join("、")}：缺失 ${group.periods.length} 个月环比数据：${summarizePeriodRanges(group.periods, null)}。`),
        ...(missingGroups.length ? ["已按持平填补，缺失段以虚线表示，后续累计值均含填补假设。"] : []),
        "按公开环比连乘估算，受舍入与权重调整影响；非官方定基指数，不代表具体房产价格。",
      ]}
      headingClassName="interval-heading" headingContent={<span className="interval-meta">{scope} · 环比连乘 · 起点 = 100</span>}>
      <div className="interval-toolbar">
        {selection.cities.length === 1 && <dl className="interval-summary" aria-live="polite" aria-describedby={imputedCount ? "interval-fill-note" : undefined}>
          <div><dt>终点指数{estimateLabel && <sup className="interval-estimate-marker" aria-hidden="true">*</sup>}</dt><dd data-testid="interval-end-index">{endIndex == null ? "--" : endIndex.toFixed(1)}</dd></div>
          <div><dt>区间累计涨跌{estimateLabel && <sup className="interval-estimate-marker" aria-hidden="true">*</sup>}</dt><dd data-testid="interval-change" style={{ color: change == null || change === 0 ? COLORS.text : change > 0 ? COLORS.up : COLORS.down }}>{change == null ? "--" : formatPct(change)}</dd></div>
        </dl>}
      </div>
      {!selection.cities.length ? <div className="empty-chart interval-incomplete" role="status">请选择至少一个城市</div>
        : loadError ? <div className="data-error" role="alert">{loadError}</div>
          : !results ? <div className="content-loader analysis-loader" aria-label="区间指数加载中"><span /><span /><span /></div>
            : (
            <EChart
              option={option}
              group="city-history"
              periodInteraction={{ periods, selected: period, onSelect: onPeriodChange }}
              height={(isMobile ? 300 : 360) + (multiple ? 40 : 0)}
              ariaLabel={`${selection.cities.join("、")}区间指数，起点100${multiple ? "" : `，终点${endIndex?.toFixed(1)}`}${estimateLabel}`}
            />
          )}
      {multiple && results && <table className="interval-results" aria-label="区间指数对比结果" aria-describedby={estimateLabel ? "interval-fill-note" : undefined}>
        <thead><tr><th scope="col">城市</th><th scope="col">终点指数</th><th scope="col">区间累计涨跌</th></tr></thead>
        <tbody>{results.map((result) => {
          const change = result.endIndex == null ? null : result.endIndex - 100;
          return <tr key={result.city} data-city={result.city}>
            <th scope="row"><span className="city-color-swatch" style={{ backgroundColor: cityColors.get(result.city) }} aria-hidden="true" />{result.city}{result.imputedPeriods.length > 0 && <sup className="interval-estimate-marker" aria-hidden="true">*</sup>}</th>
            <td data-testid="interval-end-index">{result.endIndex?.toFixed(1) ?? "--"}</td>
            <td data-testid="interval-change" style={{ color: change == null || change === 0 ? COLORS.text : change > 0 ? COLORS.up : COLORS.down }}>{change == null ? "--" : formatPct(change)}</td>
          </tr>;
        })}</tbody>
      </table>}
      {missingGroups.length > 0 && <div id="interval-fill-note" className="trend-note interval-fill-note" role="status">
        {missingGroups.map((group) => <p key={group.cities.join(",")}>* {multiple ? `${group.cities.join("、")}：` : ""}缺失 {group.periods.length} 个月环比数据：{summarizePeriodRanges(group.periods, null)}。</p>)}
        <p>已按持平填补，缺失段以虚线表示，后续累计值均含填补假设。</p>
      </div>}
      <p className="trend-note interval-method">按公开环比连乘估算，受舍入与权重调整影响；非官方定基指数，不代表具体房产价格。</p>
    </ChartPanel>
  );
}
