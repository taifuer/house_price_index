import { useEffect, useMemo, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";

import { CityPicker } from "../CityPicker";
import { EChart } from "../EChart";
import { Segmented } from "../Segmented";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { CITY_SERIES_COLORS, reconcileCityColors } from "../../lib/cityColors";
import { buildOverallTrend, buildTierTrend, marketBreadth } from "../../lib/data";
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
      hideOverlap: false,
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
  metric,
  mode,
  range,
  onModeChange,
  onRangeChange,
}: OverallTrendChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const overall = useMemo(() => buildOverallTrend(manifest, shard), [manifest, shard]);
  const tierTrend = useMemo(() => buildTierTrend(manifest, shard), [manifest, shard]);
  const allPeriods = overall.map((item) => item.period);
  const visiblePeriods = periodsForRange(allPeriods, range);
  const visibleSet = new Set(visiblePeriods);

  const overallOption = useMemo<EChartsCoreOption>(() => {
    const visible = overall.filter((item) => visibleSet.has(item.period));
    return {
      animationDuration: 350,
      aria: { enabled: true, description: "各月上涨、持平和下跌城市数量趋势" },
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
            ? `${item.period}<br/>上涨 ${item.up}<br/>持平 ${item.flat}<br/>下跌 ${item.down}<br/>覆盖城市 ${item.covered}/${manifest.cities.length}<br/>${item.complete ? "数据完整" : "数据不完整"}`
            : "";
        },
      },
      xAxis: yearAxis(visiblePeriods, true, isMobile ? MOBILE_MAX_YEAR_LABELS : undefined),
      yAxis: {
        type: "value",
        min: -manifest.cities.length,
        max: manifest.cities.length,
        interval: Math.ceil(manifest.cities.length / 2),
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => Math.abs(value).toString() },
        splitLine: { lineStyle: splitLineStyle },
        name: "城市数",
        nameTextStyle: axisLabelStyle,
      },
      series: [
        { name: "上涨", type: "bar", stack: "direction", barMaxWidth: 12, data: visible.map((item) => item.up), itemStyle: { color: COLORS.up } },
        { name: "持平", type: "bar", stack: "direction", barMaxWidth: 12, data: visible.map((item) => item.flat), itemStyle: { color: COLORS.flat } },
        { name: "下跌", type: "bar", stack: "direction", barMaxWidth: 12, data: visible.map((item) => -item.down), itemStyle: { color: COLORS.down } },
      ],
    };
  }, [isMobile, manifest.cities.length, overall, visiblePeriods, visibleSet]);

  const breadthOption = useMemo<EChartsCoreOption>(() => {
    const visible = overall.filter((item) => visibleSet.has(item.period));
    return {
      animationDuration: 350,
      aria: { enabled: true, description: "上涨城市与下跌城市之差占覆盖城市比例的历史趋势" },
      grid: { left: 58, right: 18, top: 24, bottom: isMobile ? 44 : 54 },
      tooltip: {
        trigger: "axis",
        formatter: (raw: unknown) => {
          const params = raw as Array<{ dataIndex: number; value: number | null }>;
          const item = visible[params[0]?.dataIndex ?? -1];
          if (!item) return "";
          const value = marketBreadth(item);
          return `${item.period}<br/>市场广度 ${value == null ? "无数据" : formatPct(value)}<br/>上涨 ${item.up}｜下跌 ${item.down}<br/>覆盖城市 ${item.covered}/${manifest.cities.length}`;
        },
      },
      xAxis: yearAxis(visiblePeriods, true, isMobile ? MOBILE_MAX_YEAR_LABELS : undefined),
      yAxis: {
        type: "value",
        min: -100,
        max: 100,
        interval: 50,
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: splitLineStyle },
        name: "市场广度（%）",
        nameLocation: "middle",
        nameGap: 44,
        nameTextStyle: axisLabelStyle,
      },
      series: [{
        name: "市场广度",
        type: "line",
        connectNulls: false,
        showSymbol: visiblePeriods.length <= 60,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2, color: COLORS.selection },
        itemStyle: { color: COLORS.selection },
        data: visible.map(marketBreadth),
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: COLORS.baseline },
          data: [{ yAxis: 0 }],
        },
      }],
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
            ? `${tier}<br/>月份 ${item.period}<br/>上涨 ${item.up} 城<br/>持平 ${item.flat} 城<br/>下跌 ${item.down} 城<br/>覆盖城市 ${item.covered}/${item.expected}<br/>${item.complete ? "数据完整" : "数据不完整"}`
            : "";
        },
      },
      xAxis: axes,
      yAxis: tiers.map((_, index) => ({
        type: "value",
        gridIndex: index,
        min: -100,
        max: 100,
        interval: 50,
        axisLabel: { ...axisLabelStyle, formatter: (value: number) => `${Math.abs(value)}%` },
        splitLine: { lineStyle: splitLineStyle },
      })),
      series: tiers.flatMap((tier, index) => {
        const visible = tierTrend.filter((item) => item.tier === tier && visibleSet.has(item.period));
        return [
          { name: "上涨", type: "bar", stack: `tier-${tier}`, xAxisIndex: index, yAxisIndex: index, barMaxWidth: 12, data: visible.map((item) => item.upPct), itemStyle: { color: COLORS.up } },
          { name: "持平", type: "bar", stack: `tier-${tier}`, xAxisIndex: index, yAxisIndex: index, barMaxWidth: 12, data: visible.map((item) => item.flatPct), itemStyle: { color: COLORS.flat } },
          { name: "下跌", type: "bar", stack: `tier-${tier}`, xAxisIndex: index, yAxisIndex: index, barMaxWidth: 12, data: visible.map((item) => -item.downPct), itemStyle: { color: COLORS.down } },
        ];
      }),
    };
  }, [isMobile, manifest.cities, tierTrend, visiblePeriods, visibleSet]);

  const incomplete = mode === "overall"
    ? overall.filter((item) => visibleSet.has(item.period) && !item.complete).map((item) => item.period)
    : mode === "tier"
      ? [...new Set(tierTrend.filter((item) => visibleSet.has(item.period) && !item.complete).map((item) => item.period))]
      : overall.filter((item) => visibleSet.has(item.period) && !item.complete).map((item) => item.period);
  const note = missingNote(incomplete, mode === "tier" ? "分层数据不完整" : "数据不完整");
  const displayedOption = mode === "overall" ? overallOption : mode === "tier" ? tierOption : breadthOption;

  return (
    <div className="chart-block overall-trend-chart">
      <h3 className="analysis-chart-title">整体趋势</h3>
      <div className="paired-chart-controls">
        <div className="paired-chart-control trend-mode-row">
          <Segmented
            value={mode}
            options={[
              { value: "overall", label: "总体" },
              { value: "tier", label: "分层" },
              { value: "breadth", label: "广度" },
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
        ariaLabel={mode === "overall" ? "总体涨跌城市数量趋势" : mode === "tier" ? "分层涨跌城市占比趋势" : "市场广度趋势"}
        fileName={`${filePrefix}-${mode === "overall" ? "整体趋势" : mode === "tier" ? "分层趋势" : "市场广度"}`}
      />
      {note && <p className="trend-note">{note}</p>}
      {mode === "breadth" && <p className="trend-note">* 市场广度 =（上涨城市数 - 下跌城市数）/ 覆盖城市数，为派生指标。</p>}
    </div>
  );
}

interface CityTrendChartProps extends TrendProps {
  selectedCities: string[];
  onSelectedCitiesChange: (cities: string[]) => void;
  range: TrendRange;
  onRangeChange: (range: TrendRange) => void;
}

export function CityTrendChart({
  manifest,
  shard,
  filePrefix,
  metric,
  selectedCities,
  onSelectedCitiesChange,
  range,
  onRangeChange,
}: CityTrendChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const periods = shard.periods.length ? completeMonths(shard.periods[0]!, shard.periods.at(-1)!) : [];
  const visiblePeriods = periodsForRange(periods, range);
  const rowsByPeriod = new Map(shard.periods.map((period, index) => [period, shard.values[index] ?? []]));
  const cityIndexes = new Map(manifest.cities.map((city, index) => [city.name, index]));
  const [cityColors, setCityColors] = useState(() => reconcileCityColors(selectedCities, new Map()));

  useEffect(() => {
    setCityColors((previous) => {
      const next = reconcileCityColors(selectedCities, previous);
      const unchanged = next.size === previous.size
        && [...next].every(([city, color]) => previous.get(city) === color);
      return unchanged ? previous : next;
    });
  }, [selectedCities]);

  const updateSelectedCities = (cities: string[]) => {
    setCityColors((previous) => reconcileCityColors(cities, previous));
    onSelectedCitiesChange(cities);
  };

  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 350,
    aria: { enabled: true, description: "选中城市的价格变动历史趋势" },
    color: [...CITY_SERIES_COLORS],
    legend: {
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
    grid: { left: 52, right: 18, top: 24, bottom: isMobile ? 60 : 82 },
    tooltip: { trigger: "axis", borderColor: "#d0d5dd", valueFormatter: (value: unknown) => value == null ? "无数据" : formatPct(Number(value)) },
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
    <div className="chart-block city-trend-chart">
      <div className="chart-heading-row trend-chart-heading">
        <h3>走势对比</h3>
        <Segmented value={range} options={rangeOptions} onChange={onRangeChange} label="走势对比时间范围" />
      </div>
      <CityPicker
        cities={manifest.cities}
        selected={selectedCities}
        onChange={updateSelectedCities}
        maxSelected={CITY_SERIES_COLORS.length}
      />
      {selectedCities.length ? (
        <EChart option={option} height={425} ariaLabel="选中城市价格走势对比" fileName={`${filePrefix}-走势对比`} />
      ) : (
        <div className="empty-chart">请选择至少一个城市</div>
      )}
      {note && <p className="trend-note">{note}</p>}
    </div>
  );
}
