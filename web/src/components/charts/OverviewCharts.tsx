import { useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "../EChart";
import { Segmented } from "../Segmented";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { buildHistogram } from "../../lib/data";
import { formatPct } from "../../lib/format";
import {
  axisLabelStyle,
  axisLineStyle,
  changeColor,
  COLORS,
  splitLineStyle,
} from "../../lib/chartTheme";
import type { CityDatum, CityTier } from "../../types";

type TierFilter = "全部" | CityTier;

interface AxisExtent {
  min: number;
  max: number;
}

function paddedAxisMinimum({ min, max }: AxisExtent): number {
  const padding = Math.max(0.1, (max - min) * 0.15);
  return Math.floor((Math.min(0, min) - padding + 1e-9) * 10) / 10;
}

function paddedAxisMaximum({ min, max }: AxisExtent): number {
  const padding = Math.max(0.1, (max - min) * 0.15);
  return Math.ceil((Math.max(0, max) + padding - 1e-9) * 10) / 10;
}

interface OverviewChartProps {
  data: CityDatum[];
  filePrefix: string;
}

export function RankingChart({ data, filePrefix }: OverviewChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [tier, setTier] = useState<TierFilter>("全部");
  const visible = useMemo(
    () => (tier === "全部" ? data : data.filter((datum) => datum.tier === tier)),
    [data, tier],
  );
  const maximum = Math.max(...data.map((datum) => Math.abs(datum.change)), 0.1);
  const windowSize = Math.min(visible.length, isMobile ? 10 : 30);
  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 350,
    aria: { enabled: true, description: "按价格变动从高到低排列的城市柱状图" },
    grid: { left: isMobile ? 42 : 54, right: 18, top: 30, bottom: isMobile ? 96 : 118 },
    tooltip: {
      trigger: "item",
      borderColor: "#d0d5dd",
      formatter: (raw: unknown) => {
        const params = raw as { dataIndex: number };
        const datum = visible[params.dataIndex];
        return datum
          ? `当前排名 ${params.dataIndex + 1}<br/>全市排名 ${datum.rank}<br/>${datum.city}（${datum.tier}）<br/>指数 ${datum.value.toFixed(1)}<br/>变动 ${formatPct(datum.change)}`
          : "";
      },
    },
    xAxis: {
      type: "category",
      data: visible.map((datum) => datum.city),
      axisLine: { lineStyle: axisLineStyle },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle, interval: 0, rotate: 38, margin: 16 },
    },
    yAxis: {
      type: "value",
      min: paddedAxisMinimum,
      max: paddedAxisMaximum,
      axisLabel: { ...axisLabelStyle, formatter: (value: number) => value.toFixed(1) },
      splitLine: { lineStyle: splitLineStyle },
    },
    dataZoom: visible.length > windowSize ? [{
      type: "slider",
      startValue: 0,
      endValue: windowSize - 1,
      minValueSpan: 4,
      height: isMobile ? 28 : 30,
      bottom: 14,
      borderColor: "#7aa7e8",
      borderWidth: 2,
      backgroundColor: "#f8fafc",
      fillerColor: "rgba(37, 99, 235, 0.18)",
      dataBackground: { lineStyle: { color: "#cbd5e1" }, areaStyle: { color: "#e5e7eb" } },
      selectedDataBackground: { lineStyle: { color: COLORS.selection, width: 2 }, areaStyle: { color: "#93b4e8" } },
      handleSize: "115%",
      handleStyle: { color: "#ffffff", borderColor: COLORS.selection, borderWidth: 2 },
      moveHandleSize: 8,
      moveHandleStyle: { color: COLORS.selection, opacity: 0.75 },
      brushSelect: false,
      showDetail: false,
    }] : [],
    series: [{
      type: "bar",
      barMaxWidth: 28,
      data: visible.map((datum) => ({
        value: datum.change,
        itemStyle: { color: changeColor(datum.change, maximum) },
        label: { position: datum.change < 0 ? "bottom" : "top", distance: 4 },
      })),
      label: {
        show: true,
        position: "outside",
        color: COLORS.muted,
        fontSize: isMobile ? 8 : 9,
        formatter: (raw: unknown) => formatPct(Number((raw as { value: number }).value)),
      },
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { color: COLORS.baseline, width: 1 },
        label: { show: false },
        data: [{ yAxis: 0 }],
      },
    }],
  }), [isMobile, maximum, visible, windowSize]);

  return (
    <div className="chart-block ranking-chart">
      <div className="chart-heading-row">
        <h3>城市排名</h3>
        <Segmented
          label="城市层级"
          value={tier}
          onChange={setTier}
          options={(["全部", "一线", "二线", "三线"] as TierFilter[]).map((value) => ({ value, label: value }))}
        />
      </div>
      <EChart
        option={option}
        height={isMobile ? 500 : 555}
        ariaLabel="城市价格变动排名"
        fileName={`${filePrefix}-城市排名`}
        showReset={!isMobile}
      />
    </div>
  );
}

export function ExtremeChart({ data, filePrefix }: OverviewChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const extremes = useMemo(() => {
    const selected = [...data.slice(0, 5), ...data.slice(-5)];
    return [...new Map(selected.map((datum) => [datum.city, datum])).values()].sort((a, b) => a.change - b.change);
  }, [data]);
  const maximum = Math.max(...data.map((datum) => Math.abs(datum.change)), 0.1);
  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 350,
    aria: { enabled: true, description: "价格变动最高和最低城市对比" },
    grid: { left: isMobile ? 84 : 66, right: 34, top: 44, bottom: 42 },
    tooltip: {
      trigger: "item",
      formatter: (raw: unknown) => {
        const params = raw as { dataIndex: number };
        const datum = extremes[params.dataIndex];
        return datum ? `${datum.city}（${datum.tier}）<br/>指数 ${datum.value.toFixed(1)}<br/>变动 ${formatPct(datum.change)}` : "";
      },
    },
    xAxis: {
      type: "value",
      axisLabel: axisLabelStyle,
      splitLine: { lineStyle: splitLineStyle },
      name: "较基期变动",
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: axisLabelStyle,
    },
    yAxis: {
      type: "category",
      data: extremes.map((datum) => datum.city),
      axisLabel: { ...axisLabelStyle, color: COLORS.text, margin: isMobile ? 26 : 8 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: "bar",
      barMaxWidth: 22,
      data: extremes.map((datum) => {
        const placeInside = datum.change < 0 && Math.abs(datum.change) >= maximum * 0.18;
        return {
          value: datum.change,
          itemStyle: { color: changeColor(datum.change, maximum) },
          label: placeInside
            ? { position: "insideLeft", color: "#ffffff", distance: 5 }
            : { position: "outside", color: COLORS.muted, distance: 5 },
        };
      }),
      label: {
        show: true,
        position: "outside",
        color: COLORS.muted,
        formatter: (raw: unknown) => formatPct(Number((raw as { value: number }).value)),
      },
      markLine: { silent: true, symbol: "none", label: { show: false }, data: [{ xAxis: 0 }], lineStyle: { color: COLORS.baseline } },
    }],
  }), [extremes, isMobile, maximum]);
  return (
    <div className="chart-block compact-chart">
      <h3>首尾城市对比</h3>
      <EChart option={option} height={365} ariaLabel="首尾城市价格变动对比" fileName={`${filePrefix}-首尾城市对比`} />
    </div>
  );
}

export function DistributionChart({ data, filePrefix }: OverviewChartProps) {
  const bins = useMemo(() => buildHistogram(data.map((datum) => datum.change), 18), [data]);
  const maximum = Math.max(...data.map((datum) => Math.abs(datum.change)), 0.1);
  const zeroIndex = bins.findIndex((bin) => bin.left <= 0 && bin.right >= 0);
  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 350,
    aria: { enabled: true, description: "城市价格涨跌幅直方分布" },
    grid: { left: 48, right: 18, top: 18, bottom: 58 },
    tooltip: {
      trigger: "item",
      formatter: (raw: unknown) => {
        const params = raw as { dataIndex: number };
        const bin = bins[params.dataIndex];
        return bin ? `变动区间 ${bin.left.toFixed(1)} 至 ${bin.right.toFixed(1)}<br/>城市数 ${bin.count}<br/>区间中点 ${bin.midpoint.toFixed(2)}` : "";
      },
    },
    xAxis: {
      type: "category",
      data: bins.map((_, index) => index),
      axisLine: { lineStyle: axisLineStyle },
      axisTick: { show: false },
      axisLabel: {
        ...axisLabelStyle,
        formatter: (_value: string, index: number) => {
          if (index === 0) return bins[0]?.left.toFixed(1) ?? "";
          if (index === bins.length - 1) return bins.at(-1)?.right.toFixed(1) ?? "";
          if (index === zeroIndex) return "0";
          return "";
        },
      },
      name: "较基期变动",
      nameLocation: "middle",
      nameGap: 34,
      nameTextStyle: axisLabelStyle,
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: axisLabelStyle,
      splitLine: { lineStyle: splitLineStyle },
      name: "城市数",
      nameTextStyle: axisLabelStyle,
    },
    series: [{
      type: "bar",
      barCategoryGap: "0%",
      data: bins.map((bin) => ({ value: bin.count, itemStyle: { color: changeColor(bin.midpoint, maximum) } })),
      markLine: zeroIndex >= 0 ? {
        silent: true,
        symbol: "none",
        label: { show: false },
        lineStyle: { color: COLORS.baseline },
        data: [{ xAxis: zeroIndex }],
      } : undefined,
    }],
  }), [bins, maximum, zeroIndex]);
  return (
    <div className="chart-block compact-chart">
      <h3>城市涨跌分布</h3>
      <EChart option={option} height={365} ariaLabel="城市价格涨跌分布" fileName={`${filePrefix}-城市涨跌分布`} />
    </div>
  );
}

interface TierSummary {
  tier: CityTier;
  cities: number;
  up: number;
  flat: number;
  down: number;
  mean: number;
  minimum: number;
  maximum: number;
}

export function TierComparisonChart({ data, filePrefix }: OverviewChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const summaries = useMemo<TierSummary[]>(() => (["一线", "二线", "三线"] as CityTier[]).map((tier) => {
    const values = data.filter((datum) => datum.tier === tier).map((datum) => datum.change);
    const hasValues = values.length > 0;
    return {
      tier,
      cities: values.length,
      up: values.filter((value) => value > 0).length,
      flat: values.filter((value) => value === 0).length,
      down: values.filter((value) => value < 0).length,
      mean: hasValues ? values.reduce((total, value) => total + value, 0) / values.length : 0,
      minimum: hasValues ? Math.min(...values) : 0,
      maximum: hasValues ? Math.max(...values) : 0,
    };
  }), [data]);
  const countLimit = Math.max(5, Math.ceil(Math.max(...summaries.flatMap((item) => [item.up, item.down])) / 5) * 5);
  const changeLimit = Math.max(0.5, Math.max(...summaries.flatMap((item) => [Math.abs(item.minimum), Math.abs(item.maximum)])) * 1.25);
  const countGrid = isMobile
    ? { left: 62, right: 24, top: 46, height: 185 }
    : { left: 62, width: "39%", top: 50, bottom: 48 };
  const rangeGrid = isMobile
    ? { left: 62, right: 24, top: 330, height: 185 }
    : { left: "57%", right: 28, top: 50, bottom: 48 };
  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 350,
    aria: { enabled: true, description: "一二三线城市涨跌数量和涨跌幅范围比较" },
    title: [
      { text: "涨跌数量", left: isMobile ? 56 : "22%", top: isMobile ? 8 : 8, textStyle: { fontSize: 13, fontWeight: 500, color: COLORS.muted } },
      { text: "涨跌幅范围", left: isMobile ? 56 : "70%", top: isMobile ? 292 : 8, textStyle: { fontSize: 13, fontWeight: 500, color: COLORS.muted } },
    ],
    grid: [countGrid, rangeGrid],
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (raw: unknown) => {
        const params = raw as { data: { summary?: TierSummary } };
        const item = params.data.summary;
        return item
          ? `${item.tier}<br/>上涨 ${item.up} 城｜持平 ${item.flat} 城｜下跌 ${item.down} 城<br/>均值 ${formatPct(item.mean)}<br/>范围 ${formatPct(item.minimum)} 至 ${formatPct(item.maximum)}`
          : "";
      },
    },
    xAxis: [
      {
        type: "value",
        gridIndex: 0,
        min: -countLimit,
        max: countLimit,
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => Math.abs(value).toString() },
        splitLine: { lineStyle: splitLineStyle },
        name: "城市数",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: axisLabelStyle,
      },
      {
        type: "value",
        gridIndex: 1,
        min: -changeLimit,
        max: changeLimit,
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => value.toFixed(1) },
        splitLine: { lineStyle: splitLineStyle },
        name: "较基期变动",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: axisLabelStyle,
      },
    ],
    yAxis: [
      { type: "category", gridIndex: 0, data: summaries.map((item) => item.tier), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisLabelStyle, color: COLORS.text } },
      { type: "category", gridIndex: 1, data: summaries.map((item) => item.tier), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisLabelStyle, show: isMobile, color: COLORS.text } },
    ],
    series: [
      {
        name: "下跌",
        type: "bar",
        xAxisIndex: 0,
        yAxisIndex: 0,
        stack: "direction",
        barWidth: 22,
        data: summaries.map((item) => ({ value: -item.down, summary: item })),
        itemStyle: { color: COLORS.down },
        label: {
          show: true,
          position: "inside",
          color: "#ffffff",
          formatter: (raw: unknown) => {
            const value = Number((raw as { value: number }).value);
            return value === 0 ? "" : String(Math.abs(value));
          },
        },
        markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: COLORS.baseline }, data: [{ xAxis: 0 }] },
      },
      {
        name: "上涨",
        type: "bar",
        xAxisIndex: 0,
        yAxisIndex: 0,
        stack: "direction",
        barWidth: 22,
        data: summaries.map((item) => ({ value: item.up, summary: item })),
        itemStyle: { color: COLORS.up },
        label: {
          show: true,
          position: "inside",
          color: "#ffffff",
          formatter: (raw: unknown) => {
            const value = Number((raw as { value: number }).value);
            return value === 0 ? "" : String(value);
          },
        },
      },
      {
        name: "持平",
        type: "scatter",
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbol: "rect",
        symbolSize: [40, 18],
        data: summaries.map((item) => ({ value: [0, item.tier], summary: item })),
        itemStyle: { color: "rgba(0, 0, 0, 0)" },
      },
      {
        name: "范围与均值",
        type: "custom",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: summaries.map((item, index) => ({ value: [item.minimum, item.maximum, item.mean, index], summary: item })),
        renderItem: (_params: unknown, api: { value: (index: number) => number; coord: (value: [number, number]) => [number, number] }) => {
          const minimum = api.value(0);
          const maximum = api.value(1);
          const mean = api.value(2);
          const category = api.value(3);
          const left = api.coord([minimum, category]);
          const right = api.coord([maximum, category]);
          const center = api.coord([mean, category]);
          return {
            type: "group",
            children: [
              { type: "line", shape: { x1: left[0], y1: left[1], x2: right[0], y2: right[1] }, style: { stroke: COLORS.baseline, lineWidth: 13, opacity: 0.2 } },
              { type: "circle", shape: { cx: left[0], cy: left[1], r: 5 }, style: { fill: COLORS.down, stroke: "#ffffff", lineWidth: 1 } },
              { type: "circle", shape: { cx: right[0], cy: right[1], r: 5 }, style: { fill: COLORS.up, stroke: "#ffffff", lineWidth: 1 } },
              { type: "polygon", shape: { points: [[center[0], center[1] - 7], [center[0] + 7, center[1]], [center[0], center[1] + 7], [center[0] - 7, center[1]]] }, style: { fill: COLORS.text, stroke: "#ffffff", lineWidth: 1.5 } },
              { type: "text", style: { x: center[0], y: center[1] - 13, text: formatPct(mean), textAlign: "center", textVerticalAlign: "bottom", fill: COLORS.muted, fontSize: 10 } },
            ],
          };
        },
      },
    ],
  }), [changeLimit, countGrid, countLimit, isMobile, rangeGrid, summaries]);

  return (
    <div className="chart-block tier-comparison-chart">
      <h3>城市层级对比</h3>
      <EChart option={option} height={isMobile ? 570 : 365} ariaLabel="城市层级涨跌数量与范围对比" fileName={`${filePrefix}-城市层级对比`} />
    </div>
  );
}
