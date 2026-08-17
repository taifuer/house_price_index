import { describe, expect, it } from "vitest";

import type { DatasetShard, Manifest } from "../types";
import { buildHistogram, buildOverallTrend, cityDataForPeriod } from "./data";
import { completeMonths, formatPct, periodsForRange, summarizePeriodRanges } from "./format";

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

  it("builds a stable histogram including the maximum", () => {
    const histogram = buildHistogram([-1, -0.5, 0, 0.5, 1], 4);
    expect(histogram.reduce((total, bin) => total + bin.count, 0)).toBe(5);
    expect(histogram.at(-1)?.right).toBe(1);
  });
});

describe("formatting", () => {
  it("formats percentages and month ranges", () => {
    expect(formatPct(0)).toBe("+0.0");
    expect(formatPct(-0.26)).toBe("-0.3");
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
