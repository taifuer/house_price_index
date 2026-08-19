import { describe, expect, it } from "vitest";

import type { DatasetShard, Manifest } from "../types";
import { buildFrequencyDistribution, buildOverallTrend, cityDataForPeriod, marketBreadth } from "./data";
import { completeMonths, formatMetric, formatPct, metricAxisName, periodsForRange, summarizePeriodRanges } from "./format";

const manifest = {
  cities: [
    { name: "北京", tier: "一线" },
    { name: "上海", tier: "一线" },
    { name: "天津", tier: "二线" },
  ],
} as Manifest;

const shard = {
  periods: ["2026-01", "2026-03"],
  values: [
    [100.2, 100, 99.8],
    [99.9, null, 100.1],
  ],
} as DatasetShard;

describe("data transforms", () => {
  it("sorts and ranks city values", () => {
    const values = cityDataForPeriod(manifest, shard, "2026-01");
    expect(values.map((item) => [item.city, item.change, item.rank])).toEqual([
      ["北京", 0.2, 1],
      ["上海", 0, 2],
      ["天津", -0.2, 3],
    ]);
  });

  it("keeps missing months visible in overall trends", () => {
    expect(buildOverallTrend(manifest, shard)).toEqual([
      { period: "2026-01", up: 1, flat: 1, down: 1, covered: 3, complete: true },
      { period: "2026-02", up: 0, flat: 0, down: 0, covered: 0, complete: false },
      { period: "2026-03", up: 1, flat: 0, down: 1, covered: 2, complete: false },
    ]);
  });

  it("derives market breadth from covered cities", () => {
    expect(marketBreadth({ up: 40, down: 20, covered: 70 })).toBe(28.6);
    expect(marketBreadth({ up: 0, down: 0, covered: 0 })).toBeNull();
  });

  it("counts each published tenth-point value without merging endpoints", () => {
    expect(buildFrequencyDistribution([-0.3, -0.3, 0.3, 0.4])).toEqual([
      { value: -0.3, count: 2 },
      { value: 0.3, count: 1 },
      { value: 0.4, count: 1 },
    ]);
  });
});

describe("formatting", () => {
  it("formats percentages and month ranges", () => {
    expect(formatPct(0)).toBe("0.0%");
    expect(formatPct(-0.26)).toBe("-0.3%");
    expect(formatMetric("累计平均")).toBe("累计平均同比");
    expect(metricAxisName("环比")).toBe("环比涨跌幅（%）");
    expect(completeMonths("2025-12", "2026-02")).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(summarizePeriodRanges(["2026-01", "2026-02", "2026-04"])).toBe(
      "2026年1月 至 2026年2月、2026年4月",
    );
  });

  it("limits trends by complete months", () => {
    const periods = completeMonths("2015-01", "2026-07");
    expect(periodsForRange(periods, "10y")).toHaveLength(120);
    expect(periodsForRange(periods, "all")).toHaveLength(periods.length);
  });
});
