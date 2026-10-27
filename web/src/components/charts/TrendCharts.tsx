import { useMemo, type ReactNode } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "../EChart";
import { ChartPanel } from "../ChartPanel";
import { Segmented } from "../Segmented";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { CITY_SERIES_COLORS } from "../../lib/cityColors";
import type { IntervalSelection } from "../../lib/intervalIndex";
import { buildOverallTrend, buildTierTrend } from "../../lib/data";
import { COLORS, axisLabelStyle, firstPeriodByYear, splitLineStyle } from "../../lib/chartTheme";
import { completeMonths, formatPct, metricAxisName, periodsForRange, roundOne, summarizePeriodRanges } from "../../lib/format";
import type { CityTier, DatasetShard, Manifest, TrendMode, TrendRange } from "../../types";

const rangeOptions: ReadonlyArray<{ value: TrendRange; label: string }> = [
  { value: "all", label: "全部" },
  { value: "3y", label: "近3年" },
  { value: "5y", label: "近5年" },
  { value: "10y", label: "近10年" },
];

const MOBILE_MAX_YEAR_LABELS = 5;

interface TrendProps {
  manifest: Manifest;
  shard: DatasetShard;
  filePrefix: string;
  subtitle: string;
  metric: string;
}

function yearAxis(periods: string[], show = true, maximumLabels?: number) {
  const allFirstPeriods = [...firstPeriodByYear(periods)];
  const labelLimit = Math.max(maximumLabels ?? allFirstPeriods.length, 2);
  const yearStep = allFirstPeriods.length > labelLimit
    ? Math.ceil((allFirstPeriods.length - 1) / (labelLimit - 1))
    : 1;
  const lastIndex = allFirstPeriods.length - 1;
  const firstPeriods = new Set(
    allFirstPeriods.filter((_, index) => (
      index === 0
      || index === lastIndex
      || (index % yearStep === 0 && lastIndex - index >= yearStep)
    )),
  );
  return {
    type: "category" as const,
    data: periods,
    axisLine: { lineStyle: { color: "#cbd5e1" } },
    axisTick: { show: false },
    axisLabel: {
      ...axisLabelStyle,
      show,
      interval: 0,
      hideOverlap: true,
      formatter: (period: string) => (firstPeriods.has(period) ? `${period.slice(0, 4)}年` : ""),
    },
  };
}

function missingNote(periods: string[], label: string): string {
  return periods.length ? `* ${periods.length} 个月份${label}：${summarizePeriodRanges(periods)}` : "";
}

interface OverallTrendChartProps extends TrendProps {
  mode: TrendMode;
  range: TrendRange;
  onModeChange: (mode: TrendMode) => void;
  onRangeChange: (range: TrendRange) => void;
}

export function OverallTrendChart({
  manifest,
  shard,
  filePrefix,
  subtitle,
  mode,
  range,
  onModeChange,
  onRangeChange,
}: OverallTrendChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const overall = useMemo(() => buildOverallTrend(manifest, shard), [manifest, shard]);
  const tierTrend = useMemo(() => buildTierTrend(manifest, shard), [manifest, shard]);
  const visiblePeriods = useMemo(() => periodsForRange(overall.map((item) => item.period), range), [overall, range]);
  const visibleSet = useMemo(() => new Set(visiblePeriods), [visiblePeriods]);

  const overallOption = useMemo<EChartsCoreOption>(() => {
    const visible = overall.filter((item) => visibleSet.has(item.period));
    return {
      animationDuration: 350,
      aria: { enabled: true, description: "各月上涨、持平、下跌和缺失城市数量趋势" },
      color: [COLORS.up, COLORS.flat, COLORS.down],
      legend: { bottom: 4, left: "center", itemWidth: 12, itemHeight: 12, textStyle: axisLabelStyle },
      grid: { left: 52, right: 18, top: 24, bottom: isMobile ? 60 : 78 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (raw: unknown) => {
          const params = raw as Array<{ dataIndex: number }>;
          const item = visible[params[0]?.dataIndex ?? -1];
          return item
            ? `${item.period}<br/>上涨 ${item.up}<br/>持平 ${item.flat}<br/>下跌 ${item.down}<br/>缺失 ${manifest.cities.length - item.covered}<br/>覆盖城市 ${item.covered}/${manifest.cities.length}`
            : "";
        },
      },
      xAxis: yearAxis(visiblePeriods, true, isMobile ? MOBILE_MAX_YEAR_LABELS : undefined),
      yAxis: {
        type: "value",
        min: 0,
        max: manifest.cities.length,
        interval: 10,
        axisLabel: axisLabelStyle,
        splitLine: { lineStyle: splitLineStyle },
        name: "城市数",
        nameTextStyle: axisLabelStyle,
      },
      series: [
        { name: "上涨", type: "bar", stack: "direction", barMaxWidth: 12, data: visible.map((item) => item.up), itemStyle: { color: COLORS.up } },
        { name: "持平", type: "bar", stack: "direction", barMaxWidth: 12, data: visible.map((item) => item.flat), itemStyle: { color: COLORS.flat } },
        { name: "下跌", type: "bar", stack: "direction", barMaxWidth: 12, data: visible.map((item) => item.down), itemStyle: { color: COLORS.down } },
        ...(visible.some((item) => !item.complete) ? [{ name: "缺失", type: "bar" as const, stack: "direction", barMaxWidth: 12,
          data: visible.map((item) => manifest.cities.length - item.covered), itemStyle: { color: "#edf0f3", decal: { symbol: "rect", dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color: "#b8c0cc" } } }] : []),
      ],
    };
  }, [isMobile, manifest.cities.length, overall, visiblePeriods, visibleSet]);

  const tierOption = useMemo<EChartsCoreOption>(() => {
    const tiers: CityTier[] = ["一线", "二线", "三线"];
    const tierStep = isMobile ? 199 : 184;
    const grids = tiers.map((_, index) => ({ left: 56, right: 18, top: 40 + index * tierStep, height: 142 }));
    const axes = tiers.map((_, index) => ({
      ...yearAxis(visiblePeriods, index === tiers.length - 1, isMobile ? MOBILE_MAX_YEAR_LABELS : undefined),
      gridIndex: index,
    }));
    return {
      animationDuration: 350,
      aria: { enabled: true, description: "一二三线城市层级内上涨、持平和下跌占比趋势" },
      legend: { bottom: 4, left: "center", itemWidth: 12, itemHeight: 12, textStyle: axisLabelStyle },
      title: tiers.map((tier, index) => ({
        text: `${tier}（${manifest.cities.filter((city) => city.tier === tier).length} 城）`,
        top: 10 + index * tierStep,
        left: "center",
        textStyle: { color: COLORS.muted, fontSize: 13, fontWeight: 500 },
      })),
      grid: grids,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (raw: unknown) => {
          const params = raw as Array<{ axisIndex: number; dataIndex: number }>;
          const first = params[0];
          if (!first) return "";
          const tier = tiers[first.axisIndex];
          const item = tierTrend.find((datum) => datum.tier === tier && datum.period === visiblePeriods[first.dataIndex]);
          return item
            ? `${tier}<br/>月份 ${item.period}<br/>上涨 ${item.up} 城<br/>持平 ${item.flat} 城<br/>下跌 ${item.down} 城<br/>缺失 ${item.expected - item.covered} 城<br/>覆盖城市 ${item.covered}/${item.expected}`
            : "";
        },
      },
      xAxis: axes,
      yAxis: tiers.map((_, index) => ({
        type: "value",
        gridIndex: index,
        min: 0,
        max: 100,
        interval: 50,
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: splitLineStyle },
      })),
      series: tiers.flatMap((tier, index) => {
        const visible = tierTrend.filter((item) => item.tier === tier && visibleSet.has(item.period));
        return [
          { name: "上涨", type: "bar", stack: `tier-${tier}`, xAxisIndex: index, yAxisIndex: index, barMaxWidth: 12, data: visible.map((item) => item.upPct), itemStyle: { color: COLORS.up } },
          { name: "持平", type: "bar", stack: `tier-${tier}`, xAxisIndex: index, yAxisIndex: index, barMaxWidth: 12, data: visible.map((item) => item.flatPct), itemStyle: { color: COLORS.flat } },
          { name: "下跌", type: "bar", stack: `tier-${tier}`, xAxisIndex: index, yAxisIndex: index, barMaxWidth: 12, data: visible.map((item) => item.downPct), itemStyle: { color: COLORS.down } },
          ...(visible.some((item) => !item.complete) ? [{ name: "缺失", type: "bar" as const, stack: `tier-${tier}`, xAxisIndex: index, yAxisIndex: index, barMaxWidth: 12,
            data: visible.map((item) => item.expected ? (item.expected - item.covered) / item.expected * 100 : 0),
            itemStyle: { color: "#edf0f3", decal: { symbol: "rect", dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color: "#b8c0cc" } } }] : []),
        ];
      }),
    };
  }, [isMobile, manifest.cities, tierTrend, visiblePeriods, visibleSet]);

  const incomplete = overall.filter((item) => visibleSet.has(item.period) && !item.complete).map((item) => item.period);
  const note = incomplete.length ? `${missingNote(incomplete, mode === "tier" ? "分层数据不完整" : "数据不完整")}。斜纹为缺失，不计作持平。` : "";
  const displayedOption = mode === "overall" ? overallOption : tierOption;

  return (
    <ChartPanel className="overall-trend-chart" title="整体趋势"
      subtitle={`${subtitle} · ${visiblePeriods[0]} - ${visiblePeriods.at(-1)} · ${mode === "overall" ? "总体" : "分层"}`}
      fileName={`${filePrefix}-${mode === "overall" ? "整体趋势" : "分层趋势"}`}
      notes={[note]}>
      <div className="paired-chart-controls">
        <div className="paired-chart-control trend-mode-row">
          <Segmented
            value={mode}
            options={[
              { value: "overall", label: "总体" },
              { value: "tier", label: "分层" },
            ]}
            onChange={onModeChange}
            label="整体趋势视图"
          />
        </div>
        <div className="paired-chart-control trend-range-row">
          <Segmented value={range} options={rangeOptions} onChange={onRangeChange} label="整体趋势时间范围" />
        </div>
      </div>
      <EChart
        option={displayedOption}
        height={mode === "tier" ? 640 : 430}
        ariaLabel={mode === "overall" ? "总体涨跌城市数量趋势" : "分层涨跌城市占比趋势"}
      />
      {note && <p className="trend-note">{note}</p>}
    </ChartPanel>
  );
}

interface CityTrendChartProps extends TrendProps {
  selectionControls?: ReactNode;
  selection: IntervalSelection;
  cityColors: ReadonlyMap<string, string>;
  period: string;
  onPeriodChange: (period: string) => void;
}

export function CityTrendChart({
  manifest,
  shard,
  filePrefix,
  subtitle,
  metric,
  selection,
  cityColors,
  period,
  onPeriodChange,
  selectionControls,
}: CityTrendChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const selectedCities = selection.cities;
  const visiblePeriods = useMemo(() => completeMonths(selection.start, selection.end), [selection.start, selection.end]);
  const rowsByPeriod = useMemo(() => new Map(shard.periods.map((period, index) => [period, shard.values[index] ?? []])), [shard]);
  const cityIndexes = useMemo(() => new Map(manifest.cities.map((city, index) => [city.name, index])), [manifest]);
  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 350,
    aria: { enabled: true, description: "选中城市的价格变动历史趋势" },
    color: [...CITY_SERIES_COLORS],
    legend: {
      data: selectedCities,
      type: "scroll",
      bottom: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 8,
      pageIconSize: 10,
      pageIconColor: COLORS.muted,
      pageIconInactiveColor: COLORS.missing,
      pageTextStyle: axisLabelStyle,
      textStyle: axisLabelStyle,
    },
    grid: { left: 52, right: 18, top: 24, bottom: isMobile ? 54 : 82 },
    tooltip: { trigger: "axis", confine: true, borderColor: "#d0d5dd",
      axisPointer: { type: "cross", label: { show: false }, crossStyle: { type: "dashed", color: COLORS.flat } },
      valueFormatter: (value: unknown) => value == null ? "无数据" : formatPct(Number(value)) },
    xAxis: yearAxis(visiblePeriods, true, isMobile ? MOBILE_MAX_YEAR_LABELS : undefined),
    yAxis: {
      type: "value",
      axisLabel: { ...axisLabelStyle, formatter: (value: number) => `${value.toFixed(1)}%` },
      splitLine: { lineStyle: splitLineStyle },
      name: metricAxisName(metric),
      nameLocation: "middle",
      nameGap: 42,
      nameTextStyle: axisLabelStyle,
    },
    series: selectedCities.map((city, colorIndex) => {
      const cityIndex = cityIndexes.get(city);
      const color = cityColors.get(city) ?? CITY_SERIES_COLORS[colorIndex % CITY_SERIES_COLORS.length];
      return {
        name: city,
        type: "line",
        connectNulls: false,
        showSymbol: false,
        symbol: "none",
        lineStyle: { width: 2.2, type: "solid", color, opacity: 0.86 },
        itemStyle: { color },
        emphasis: { focus: "series", lineStyle: { width: 3.5, opacity: 1 } },
        blur: { lineStyle: { opacity: 0.16 } },
        data: visiblePeriods.map((period) => {
          if (cityIndex == null) return null;
          const value = rowsByPeriod.get(period)?.[cityIndex];
          return value == null ? null : roundOne(value - 100);
        }),
      };
    }),
  }), [cityColors, cityIndexes, isMobile, metric, rowsByPeriod, selectedCities, visiblePeriods]);

  const missingPeriods = visiblePeriods.filter((period) => selectedCities.some((city) => {
    const cityIndex = cityIndexes.get(city);
    return cityIndex == null || rowsByPeriod.get(period)?.[cityIndex] == null;
  }));
  const note = selectedCities.length ? missingNote(missingPeriods, "选中城市数据缺失") : "";

  return (
    <ChartPanel className="city-trend-chart" title="走势对比"
      subtitle={`${selectedCities.join("、")} · ${subtitle} · ${selection.start} - ${selection.end}`}
      fileName={`${filePrefix}-走势对比`} notes={[note]} headingClassName="city-trend-heading" headingContent={selectionControls}>
      {selectedCities.length ? (
        <EChart option={option} height={425} ariaLabel="选中城市价格走势对比"
          periodInteraction={{ periods: visiblePeriods, selected: period, onSelect: onPeriodChange }} group="city-history" />
      ) : (
        <div className="empty-chart">请选择至少一个城市</div>
      )}
      {note && <p className="trend-note">{note}</p>}
    </ChartPanel>
  );
}
