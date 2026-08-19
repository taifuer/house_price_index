import { useEffect, useMemo, useState } from "react";
import { HeatmapChart as EChartsHeatmapChart } from "echarts/charts";
import { MarkAreaComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";

import { EChart } from "../EChart";
import { Segmented } from "../Segmented";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { COLORS, axisLabelStyle, splitLineStyle, symmetricScale } from "../../lib/chartTheme";
import { loadShard } from "../../lib/data";
import { completeMonths, formatMetric, formatPct, formatPeriod, roundOne } from "../../lib/format";
import type { CityTier, DatasetDescriptor, DatasetShard, Manifest, TrendRange } from "../../types";

echarts.use([EChartsHeatmapChart, MarkAreaComponent, VisualMapComponent]);

type HeatmapRange = TrendRange;
type TierFilter = "全部" | CityTier;

const HEATMAP_MONTHS: Record<Exclude<HeatmapRange, "all">, number> = {
  "3y": 36,
  "5y": 60,
  "10y": 120,
};

const HEATMAP_RANGE_LABELS: Record<HeatmapRange, string> = {
  all: "全部",
  "3y": "近3年",
  "5y": "近5年",
  "10y": "近10年",
};

const HEATMAP_RANGE_OPTIONS: HeatmapRange[] = ["all", "3y", "5y", "10y"];

interface CityViewProps {
  manifest: Manifest;
  descriptor: DatasetDescriptor;
  shard: DatasetShard;
  period: string;
  filePrefix: string;
}

function HeatmapChart({ manifest, descriptor, shard, period, filePrefix }: CityViewProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [range, setRange] = useState<HeatmapRange>("3y");
  const [tier, setTier] = useState<TierFilter>("全部");
  const allPeriods = shard.periods.length ? completeMonths(shard.periods[0]!, period) : [];
  const scopedPeriods = range === "all" ? allPeriods : allPeriods.slice(-HEATMAP_MONTHS[range]);
  const visibleCities = manifest.cities.filter((city) => tier === "全部" || city.tier === tier);
  const rowsByPeriod = new Map(shard.periods.map((item, index) => [item, shard.values[index] ?? []]));
  const cityIndexes = new Map(manifest.cities.map((city, index) => [city.name, index]));
  const maximum = Math.max(0.5, ...scopedPeriods.flatMap((item) => (
    (rowsByPeriod.get(item) ?? []).flatMap((value) => value == null ? [] : [Math.abs(roundOne(value - 100))])
  )));
  const visibleRowCount = Math.min(visibleCities.length, isMobile ? 18 : 30);
  const showRowZoom = visibleCities.length > visibleRowCount;
  const visiblePeriodCount = Math.min(scopedPeriods.length, isMobile ? 12 : 36);
  const showPeriodZoom = scopedPeriods.length > visiblePeriodCount;
  const gridBottom = showPeriodZoom ? 112 : 74;

  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 250,
    aria: { enabled: true, description: `${formatMetric(descriptor.metric)}${HEATMAP_RANGE_LABELS[range]}的城市涨跌幅热力图` },
    grid: { left: isMobile ? 48 : 62, right: showRowZoom ? (isMobile ? 62 : 34) : 16, top: 38, bottom: gridBottom },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (raw: unknown) => {
        const values = (raw as { value: [number, number, number | null] }).value;
        const city = visibleCities[values[1]];
        const selectedPeriod = scopedPeriods[values[0]];
        if (!city || !selectedPeriod) return "";
        return `${city.name}（${city.tier}）<br/>${formatPeriod(selectedPeriod)}<br/>${formatMetric(descriptor.metric)} ${values[2] == null ? "无数据" : formatPct(values[2])}`;
      },
    },
    xAxis: {
      type: "category",
      data: scopedPeriods,
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisTick: { show: false },
      axisLabel: {
        ...axisLabelStyle,
        interval: "auto",
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        formatter: (value: string) => `${value.slice(2, 4)}年${Number(value.slice(5))}月`,
      },
    },
    yAxis: {
      type: "category",
      data: visibleCities.map((city) => city.name),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle, color: COLORS.text, fontSize: isMobile ? 9 : 10 },
    },
    visualMap: {
      min: -maximum,
      max: maximum,
      precision: 1,
      dimension: 2,
      orient: "horizontal",
      left: "center",
      bottom: 2,
      itemWidth: 14,
      itemHeight: isMobile ? 150 : 220,
      text: ["上涨", "下跌"],
      textStyle: axisLabelStyle,
      inRange: { color: [COLORS.down, COLORS.downSoft, "#f2f4f7", COLORS.upSoft, COLORS.up] },
      calculable: false,
    },
    dataZoom: [
      ...(showRowZoom ? [{
        type: "slider",
        yAxisIndex: 0,
        orient: "vertical",
        right: isMobile ? 36 : 2,
        top: 38,
        bottom: gridBottom,
        width: 16,
        startValue: 0,
        endValue: visibleRowCount - 1,
        minValueSpan: visibleRowCount - 1,
        maxValueSpan: visibleRowCount - 1,
        zoomLock: true,
        brushSelect: false,
        showDetail: false,
        borderColor: "#cbd5e1",
        borderWidth: 1,
        fillerColor: "rgba(37, 99, 235, 0.2)",
        handleStyle: { color: "#ffffff", borderColor: COLORS.selection, borderWidth: 2 },
        moveHandleStyle: { color: COLORS.selection, opacity: 0.82 },
      }] : []),
      ...(showPeriodZoom ? [{
        type: "slider",
        xAxisIndex: 0,
        left: isMobile ? 48 : 62,
        right: showRowZoom ? (isMobile ? 62 : 34) : 16,
        bottom: 45,
        height: 18,
        startValue: scopedPeriods.length - visiblePeriodCount,
        endValue: scopedPeriods.length - 1,
        brushSelect: false,
        showDetail: false,
        borderColor: "#b8c5d6",
        borderWidth: 1,
        fillerColor: "rgba(37, 99, 235, 0.24)",
        handleSize: 15,
        handleStyle: { color: "#ffffff", borderColor: COLORS.selection, borderWidth: 2 },
        moveHandleStyle: { color: COLORS.selection, opacity: 0.82 },
        dataBackground: {
          lineStyle: { color: "#98a2b3", opacity: 0.5 },
          areaStyle: { color: "#d0d5dd", opacity: 0.28 },
        },
        selectedDataBackground: {
          lineStyle: { color: COLORS.selection, opacity: 0.9 },
          areaStyle: { color: COLORS.selection, opacity: 0.22 },
        },
      }] : []),
    ],
    series: [{
      type: "heatmap",
      data: scopedPeriods.flatMap((item, periodIndex) => visibleCities.map((city, cityIndex) => {
        const sourceIndex = cityIndexes.get(city.name);
        const value = sourceIndex == null ? null : rowsByPeriod.get(item)?.[sourceIndex];
        return value == null
          ? { value: [periodIndex, cityIndex, null], itemStyle: { color: "#eaecf0" } }
          : [periodIndex, cityIndex, roundOne(value - 100)];
      })),
      itemStyle: { borderColor: "#ffffff", borderWidth: 0.8 },
      emphasis: { itemStyle: { borderColor: COLORS.text, borderWidth: 1.5 } },
    }],
  }), [cityIndexes, descriptor.metric, gridBottom, isMobile, maximum, range, rowsByPeriod, scopedPeriods, showPeriodZoom, showRowZoom, visibleCities, visiblePeriodCount, visibleRowCount]);

  return (
    <div className="chart-block heatmap-chart">
      <h3 className="analysis-chart-title">城市趋势</h3>
      <div className="paired-chart-controls">
        <div className="paired-chart-control analysis-filter-control">
          <Segmented
            label="热力图城市层级"
            value={tier}
            onChange={setTier}
            options={(["全部", "一线", "二线", "三线"] as TierFilter[]).map((value) => ({ value, label: value }))}
          />
        </div>
        <div className="paired-chart-control analysis-filter-control">
          <Segmented
            label="热力图时间范围"
            value={range}
            onChange={setRange}
            options={HEATMAP_RANGE_OPTIONS.map((value) => ({
              value,
              label: HEATMAP_RANGE_LABELS[value],
            }))}
          />
        </div>
      </div>
      <EChart
        option={option}
        height={610}
        ariaLabel="城市月份涨跌幅热力图"
        fileName={`${filePrefix}-城市月份热力图`}
        showReset={!isMobile && (showRowZoom || showPeriodZoom)}
        className="heatmap-chart-shell"
      />
    </div>
  );
}

interface QuadrantChartProps {
  manifest: Manifest;
  descriptor: DatasetDescriptor;
  momShard: DatasetShard;
  yoyShard: DatasetShard;
  period: string;
  filePrefix: string;
}

const TIER_COLORS: Record<CityTier, string> = {
  一线: "#2563eb",
  二线: "#0f766e",
  三线: "#b45309",
};

const TIER_SYMBOLS: Record<CityTier, "diamond" | "circle" | "rect"> = {
  一线: "diamond",
  二线: "circle",
  三线: "rect",
};

function MomentumQuadrantChart({ manifest, momShard, yoyShard, period, filePrefix }: QuadrantChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const momIndex = momShard.periods.indexOf(period);
  const yoyIndex = yoyShard.periods.indexOf(period);
  const points = manifest.cities.flatMap((city, cityIndex) => {
    const mom = momIndex < 0 ? null : momShard.values[momIndex]?.[cityIndex];
    const yoy = yoyIndex < 0 ? null : yoyShard.values[yoyIndex]?.[cityIndex];
    return mom == null || yoy == null ? [] : [{
      city: city.name,
      tier: city.tier,
      mom: roundOne(mom - 100),
      yoy: roundOne(yoy - 100),
    }];
  });
  const { minimum: xMinimum, maximum: xMaximum, interval: xInterval } = symmetricScale(points.map((item) => item.mom), 0.5);
  const { minimum: yMinimum, maximum: yMaximum, interval: yInterval } = symmetricScale(points.map((item) => item.yoy), 1);
  const tiers: CityTier[] = ["一线", "二线", "三线"];
  const groupedPoints = new Map(tiers.map((tier) => {
    const groups = new Map<string, { mom: number; yoy: number; cities: string[] }>();
    points.filter((item) => item.tier === tier).forEach((item) => {
      const key = `${item.mom}:${item.yoy}`;
      const group = groups.get(key) ?? { mom: item.mom, yoy: item.yoy, cities: [] };
      group.cities.push(item.city);
      groups.set(key, group);
    });
    return [tier, [...groups.values()]];
  }));

  const option = useMemo<EChartsCoreOption>(() => ({
    animationDuration: 300,
    aria: { enabled: true, description: `${formatPeriod(period)}各城市环比与同比涨跌幅四象限图` },
    color: tiers.map((tier) => TIER_COLORS[tier]),
    legend: { bottom: 3, left: "center", itemWidth: 12, itemHeight: 9, textStyle: axisLabelStyle },
    grid: { left: 58, right: 22, top: 26, bottom: isMobile ? 94 : 78 },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (raw: unknown) => {
        const values = (raw as { value: [number, number, string, number] }).value;
        const cityLabel = values[3] === 1 ? values[2] : `${values[3]} 城：${values[2]}`;
        return `${cityLabel}<br/>${(raw as { seriesName: string }).seriesName}<br/>环比 ${formatPct(values[0])}<br/>同比 ${formatPct(values[1])}`;
      },
    },
    xAxis: {
      type: "value",
      min: xMinimum,
      max: xMaximum,
      interval: xInterval,
      axisLine: { lineStyle: { color: COLORS.baseline } },
      axisLabel: { ...axisLabelStyle, formatter: (value: number) => `${value.toFixed(1)}%` },
      splitLine: { lineStyle: splitLineStyle },
      name: "环比涨跌幅（%）",
      nameLocation: "middle",
      nameGap: 42,
      nameTextStyle: axisLabelStyle,
    },
    yAxis: {
      type: "value",
      min: yMinimum,
      max: yMaximum,
      interval: yInterval,
      axisLine: { lineStyle: { color: COLORS.baseline } },
      axisLabel: { ...axisLabelStyle, formatter: (value: number) => `${value.toFixed(1)}%` },
      splitLine: { lineStyle: splitLineStyle },
      name: "同比涨跌幅（%）",
      nameLocation: "middle",
      nameGap: 46,
      nameTextStyle: axisLabelStyle,
    },
    series: tiers.map((tier, index) => ({
      name: tier,
      type: "scatter",
      symbol: TIER_SYMBOLS[tier],
      symbolSize: (raw: unknown) => 8 + Math.sqrt(Number((raw as [number, number, string, number])[3])) * 4,
      data: (groupedPoints.get(tier) ?? []).map((item) => [item.mom, item.yoy, item.cities.join("、"), item.cities.length]),
      itemStyle: { color: TIER_COLORS[tier], opacity: 0.84 },
      emphasis: {
        focus: "series",
        scale: 1.5,
        label: {
          show: true,
          position: "top",
          color: COLORS.text,
          fontSize: 11,
          formatter: (raw: unknown) => {
            const values = (raw as { value: [number, number, string, number] }).value;
            return values[3] === 1 ? values[2] : `${values[3]} 城`;
          },
        },
      },
      ...(index === 0 ? {
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: COLORS.baseline, width: 1.2 },
          data: [{ xAxis: 0 }, { yAxis: 0 }],
        },
        markArea: {
          silent: true,
          label: {
            position: "insideTop",
            distance: 12,
            color: "rgba(71, 84, 103, 0.62)",
            fontSize: isMobile ? 12 : 13,
            fontWeight: 600,
            lineHeight: isMobile ? 16 : 18,
          },
          data: [
            [{ name: "同比上涨\n环比转弱", xAxis: xMinimum, yAxis: 0, itemStyle: { color: "rgba(52, 120, 212, 0.035)" } }, { xAxis: 0, yAxis: yMaximum }],
            [{ name: "双升", xAxis: 0, yAxis: 0, itemStyle: { color: "rgba(229, 72, 77, 0.045)" } }, { xAxis: xMaximum, yAxis: yMaximum }],
            [{ name: "双降", xAxis: xMinimum, yAxis: yMinimum, itemStyle: { color: "rgba(52, 120, 212, 0.05)" } }, { xAxis: 0, yAxis: 0 }],
            [{ name: "同比下跌\n环比转强", xAxis: 0, yAxis: yMinimum, itemStyle: { color: "rgba(229, 72, 77, 0.03)" } }, { xAxis: xMaximum, yAxis: 0 }],
          ],
        },
      } : {}),
    })),
  }), [groupedPoints, isMobile, period, points, tiers, xInterval, xMaximum, xMinimum, yInterval, yMaximum, yMinimum]);

  return (
    <div className="chart-block quadrant-chart">
      <h3 className="analysis-chart-title">城市环比与同比</h3>
      <EChart option={option} height={isMobile ? 540 : 500} ariaLabel="当前月份各城市环比与同比分布" fileName={`${filePrefix}-城市环比与同比`} />
      <p className="analysis-caption">共同覆盖 {points.length}/{manifest.cities.length} 城；气泡大小表示同层级同坐标城市数，仅比较同月同时具备环比和同比数据的城市。</p>
    </div>
  );
}

export function CityMonthlyView(props: CityViewProps) {
  return <HeatmapChart {...props} />;
}

export function MonthlyComparisonView(props: CityViewProps) {
  const { manifest, descriptor, shard, period, filePrefix } = props;
  const [paired, setPaired] = useState<{ key: string; mom: DatasetShard; yoy: DatasetShard } | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const momDescriptor = manifest.datasets.find((item) => (
    item.houseType === descriptor.houseType && item.sizeBand === descriptor.sizeBand && item.metric === "环比"
  ));
  const yoyDescriptor = manifest.datasets.find((item) => (
    item.houseType === descriptor.houseType && item.sizeBand === descriptor.sizeBand && item.metric === "同比"
  ));
  const pairKey = `${momDescriptor?.id ?? ""}:${yoyDescriptor?.id ?? ""}`;

  useEffect(() => {
    if (!momDescriptor || !yoyDescriptor) return undefined;
    let active = true;
    setPairError(null);
    Promise.all([
      momDescriptor.id === descriptor.id ? Promise.resolve(shard) : loadShard(momDescriptor),
      yoyDescriptor.id === descriptor.id ? Promise.resolve(shard) : loadShard(yoyDescriptor),
    ]).then(([mom, yoy]) => {
      if (active) setPaired({ key: pairKey, mom, yoy });
    }).catch((error: unknown) => {
      if (active) setPairError(error instanceof Error ? error.message : "环比、同比数据加载失败");
    });
    return () => {
      active = false;
    };
  }, [descriptor.id, momDescriptor, pairKey, shard, yoyDescriptor]);

  return (
    <div className="monthly-comparison-view">
      {!momDescriptor || !yoyDescriptor
        ? <div className="data-error" role="alert">当前住宅类型和面积段缺少环比或同比数据。</div>
        : pairError
          ? <div className="data-error" role="alert">{pairError}</div>
          : paired?.key === pairKey
            ? <MomentumQuadrantChart
                manifest={manifest}
                descriptor={descriptor}
                momShard={paired.mom}
                yoyShard={paired.yoy}
                period={period}
                filePrefix={filePrefix}
              />
            : <div className="content-loader analysis-loader"><span /><span /><span /></div>}
    </div>
  );
}
