import { useEffect, useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "../EChart";
import { FilterSelect } from "../FilterSelect";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { axisLabelStyle, COLORS, splitLineStyle } from "../../lib/chartTheme";
import { datasetForSelection, loadShard } from "../../lib/data";
import { completeMonths, formatPct, formatPeriod, formatSizeBand, summarizePeriodRanges } from "../../lib/format";
import { buildIntervalIndex, intervalLineSegments, type IntervalSelection } from "../../lib/intervalIndex";
import type { DatasetDescriptor, DatasetShard, Manifest } from "../../types";

interface IntervalIndexChartProps {
  manifest: Manifest;
  descriptor: DatasetDescriptor;
  shard: DatasetShard;
  selection: IntervalSelection;
  onSelectionChange: (selection: IntervalSelection) => void;
}

export function IntervalIndexChart({ manifest, descriptor, shard, selection, onSelectionChange }: IntervalIndexChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const momDescriptor = datasetForSelection(manifest, descriptor.houseType, descriptor.sizeBand, "环比");
  const [loaded, setLoaded] = useState<DatasetShard | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    if (!momDescriptor || descriptor.id === momDescriptor.id) return;
    let active = true;
    setError(null);
    loadShard(momDescriptor).then((data) => {
      if (active) setLoaded(data);
    }).catch((reason: unknown) => {
      if (active) setError({ id: momDescriptor.id, message: reason instanceof Error ? reason.message : "环比数据加载失败" });
    });
    return () => { active = false; };
  }, [descriptor.id, momDescriptor]);
  const momShard = descriptor.id === momDescriptor?.id ? shard : loaded?.id === momDescriptor?.id ? loaded : null;
  const loadError = !momDescriptor ? "当前住宅类型和面积段缺少环比数据。"
    : !momShard && error?.id === momDescriptor.id ? error.message : null;
  const periods = useMemo(() => momDescriptor?.periods.length
    ? completeMonths(momDescriptor.periods[0]!, momDescriptor.periods.at(-1)!) : [], [momDescriptor]);
  const result = useMemo(() => momShard
    ? buildIntervalIndex(momShard, manifest.cities.findIndex((city) => city.name === selection.city), selection.start, selection.end, true)
    : null, [manifest, momShard, selection]);
  const endIndex = result?.endIndex ?? null;
  const change = endIndex == null ? null : endIndex - 100;
  const imputedCount = result?.imputedPeriods.length ?? 0;
  const estimateLabel = imputedCount ? "（含持平填补）" : "";
  const scope = [descriptor.houseType, ...(descriptor.sizeBand === "全部" ? [] : [formatSizeBand(descriptor.sizeBand)])].join(" · ");

  const option = useMemo<EChartsCoreOption>(() => {
    const points = result?.points ?? [];
    const indices = points.flatMap((point) => point.index == null ? [] : [point.index]);
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
      aria: { enabled: true, description: `${selection.city}从${formatPeriod(selection.start)}至${formatPeriod(selection.end)}的区间指数，起点为100，按公开环比连乘估算${imputedCount ? `，${imputedCount}个月缺失数据按持平填补，后续累计值均含填补假设` : ""}` },
      title: imputedCount ? {
        text: `含持平填补：${imputedCount}个月`,
        left: isMobile ? 42 : 54,
        top: 4,
        textStyle: { color: COLORS.muted, fontSize: 12, fontWeight: "normal" },
      } : undefined,
      grid: { left: isMobile ? 42 : 54, right: 20, top: 32, bottom: 40 },
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
          const item = (Array.isArray(raw) ? raw[0] : raw) as { dataIndex: number };
          const point = points[item.dataIndex];
          if (point?.index == null) return "";
          const monthly = point.imputed ? "当月环比缺失，按持平填补" : point.mom == null ? "基准月" : `当月环比 ${formatPct(point.mom - 100)}`;
          return `${formatPeriod(point.period)} · ${selection.city}<br/>区间指数 ${point.index.toFixed(1)}${point.estimated ? "（含持平填补）" : ""}<br/>相对起点 ${formatPct(point.index - 100)}<br/>${monthly}`;
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
      series: intervalLineSegments(points).map((segment, index) => ({
        name: selection.city,
        type: "line",
        data: segment.data,
        connectNulls: false,
        showSymbol: points.length === 1,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2.2, color: COLORS.selection, type: segment.imputed ? "dashed" : "solid" },
        itemStyle: { color: COLORS.selection },
        emphasis: { disabled: true },
        markLine: index === 0 ? {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { type: "dashed", color: COLORS.baseline, width: 1 },
          data: [{ yAxis: 100 }],
        } : undefined,
      })),
    };
  }, [imputedCount, isMobile, result, selection]);

  return (
    <div className="chart-block interval-index-chart">
      <div className="chart-heading-row interval-heading">
        <h3>区间指数</h3>
        <span className="interval-meta">{scope} · 环比连乘 · 起点 = 100</span>
      </div>
      <div className="interval-toolbar">
        <div className="interval-controls">
          <label className="interval-city">
            <span>城市</span>
            <FilterSelect value={selection.city} onChange={(event) => onSelectionChange({ ...selection, city: event.target.value })}>
              {(["一线", "二线", "三线"] as const).map((tier) => (
                <optgroup key={tier} label={tier}>
                  {manifest.cities.filter((city) => city.tier === tier).map((city) => <option key={city.name} value={city.name}>{city.name}</option>)}
                </optgroup>
              ))}
            </FilterSelect>
          </label>
          <label>
            <span>起始月份</span>
            <FilterSelect value={selection.start} disabled={!periods.length} onChange={(event) => onSelectionChange({ ...selection, start: event.target.value })}>
              {periods.map((period) => <option key={period} value={period} disabled={period > selection.end}>{formatPeriod(period)}</option>)}
            </FilterSelect>
          </label>
          <label>
            <span>结束月份</span>
            <FilterSelect value={selection.end} disabled={!periods.length} onChange={(event) => onSelectionChange({ ...selection, end: event.target.value })}>
              {periods.map((period) => <option key={period} value={period} disabled={period < selection.start}>{formatPeriod(period)}</option>)}
            </FilterSelect>
          </label>
        </div>
        <dl className="interval-summary" aria-live="polite" aria-describedby={imputedCount ? "interval-fill-note" : undefined}>
          <div><dt>终点指数{estimateLabel && <sup className="interval-estimate-marker" aria-hidden="true">*</sup>}</dt><dd data-testid="interval-end-index">{endIndex == null ? "--" : endIndex.toFixed(1)}</dd></div>
          <div><dt>区间累计涨跌{estimateLabel && <sup className="interval-estimate-marker" aria-hidden="true">*</sup>}</dt><dd data-testid="interval-change" style={{ color: change == null || change === 0 ? COLORS.text : change > 0 ? COLORS.up : COLORS.down }}>{change == null ? "--" : formatPct(change)}</dd></div>
        </dl>
      </div>
      {loadError ? <div className="data-error" role="alert">{loadError}</div>
        : !result ? <div className="content-loader analysis-loader" aria-label="区间指数加载中"><span /><span /><span /></div>
          : endIndex == null ? (
            <div className="empty-chart interval-incomplete" role="status">
              <p>区间指数无法完整计算</p>
              <p>缺少 {result.missingPeriods.length} 个月环比数据：{summarizePeriodRanges(result.missingPeriods)}。</p>
            </div>
          ) : (
            <EChart
              option={option}
              height={isMobile ? 300 : 360}
              ariaLabel={`${selection.city}区间指数，起点100，终点${endIndex.toFixed(1)}${estimateLabel}`}
              fileName={`${selection.city}-${descriptor.houseType}-${formatSizeBand(descriptor.sizeBand)}-${selection.start}-${selection.end}-区间指数${estimateLabel}`}
            />
          )}
      {imputedCount > 0 && <p id="interval-fill-note" className="trend-note interval-fill-note" role="status">* 缺失 {imputedCount} 个月环比数据：{summarizePeriodRanges(result!.imputedPeriods, null)}。已按持平填补，缺失段以虚线表示，后续累计值均含填补假设。</p>}
      <p className="trend-note interval-method">按公开环比连乘估算，受舍入与权重调整影响；非官方定基指数，不代表具体房产价格。</p>
    </div>
  );
}
