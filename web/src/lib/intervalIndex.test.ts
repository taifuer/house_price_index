import { describe, expect, it } from "vitest";

import type { DatasetDescriptor, DatasetShard, Manifest } from "../types";
import { completeMonths } from "./format";
import { buildIntervalIndex, intervalLineSegments, resolveIntervalSelection } from "./intervalIndex";

const shard: DatasetShard = {
  schemaVersion: 1, id: "resale-all-mom", recordCount: 4,
  periods: ["2026-01", "2026-02", "2026-03", "2026-04"], sources: [],
  values: [[105], [110], [90], [100]],
};
const manifest = {
  cities: [{ name: "北京", tier: "一线" }, { name: "广州", tier: "一线" }],
  periodRange: ["2011-02", "2026-08"],
} as Manifest;
const descriptor = { periods: ["2011-02", "2026-08"] } as DatasetDescriptor;

describe("interval index", () => {
  it("starts at 100 and compounds from the following month, without adding percentage changes", () => {
    const result = buildIntervalIndex(shard, 0, "2026-01", "2026-04");
    expect(result.points.map((point) => point.period)).toEqual(shard.periods);
    expect(result.points[0]).toEqual({ period: "2026-01", index: 100, mom: null, imputed: false, estimated: false });
    expect(result.points[1]?.index).toBeCloseTo(110);
    expect(result.endIndex).toBeCloseTo(99);
    expect(result.missingPeriods).toEqual([]);
  });

  it("does not require the base month MoM, including same-month intervals", () => {
    const withoutBase = { ...shard, values: [[null], ...shard.values.slice(1)] };
    expect(buildIntervalIndex(withoutBase, 0, "2026-01", "2026-04").endIndex).toBeCloseTo(99);
    expect(buildIntervalIndex(withoutBase, 0, "2026-01", "2026-01")).toMatchObject({ endIndex: 100, missingPeriods: [] });
  });

  it("never rounds intermediate results", () => {
    const periods = completeMonths("2021-08", "2026-08");
    const monthly = { ...shard, periods, values: periods.map(() => [100.1]) };
    expect(buildIntervalIndex(monthly, 0, periods[0]!, periods.at(-1)!).endIndex)
      .toBeCloseTo(100 * (100.1 / 100) ** 60, 10);
  });

  it("preserves calendar gaps and never resumes a broken chain", () => {
    const incomplete = { ...shard, periods: ["2026-01", "2026-03", "2026-04"], values: [[100], [102], [103]] };
    const result = buildIntervalIndex(incomplete, 0, "2026-01", "2026-04");
    expect(result.points.map((point) => point.index)).toEqual([100, null, null, null]);
    expect(result.missingPeriods).toEqual(["2026-02"]);
    expect(result.endIndex).toBeNull();
    expect(buildIntervalIndex(incomplete, 0, "2026-02", "2026-04").endIndex).toBeCloseTo(105.06);
  });

  it.each([null, 0, -1, NaN, Infinity])("rejects missing or invalid city values: %s", (value) => {
    const invalid = { ...shard, values: [[100], [value], [101], [102]] };
    expect(buildIntervalIndex(invalid, 0, "2026-01", "2026-04")).toMatchObject({ endIndex: null, missingPeriods: ["2026-02"] });
  });

  it("does not substitute data from another city", () => {
    const cities = { ...shard, values: [[100, 100], [110, 95], [90, 100], [100, 100]] };
    expect(buildIntervalIndex(cities, 1, "2026-01", "2026-04").endIndex).toBe(95);
  });

  it("optionally holds missing months flat and resumes compounding without fabricating observed MoM values", () => {
    const incomplete = { ...shard, periods: ["2026-01", "2026-03", "2026-04"], values: [[105], [90], [100]] };
    const result = buildIntervalIndex(incomplete, 0, "2026-01", "2026-04", true);
    expect(result.points.map((point) => point.index)).toEqual([100, 100, 90, 90]);
    expect(result.points.map((point) => point.mom)).toEqual([null, null, 90, 100]);
    expect(result.points.map((point) => point.imputed)).toEqual([false, true, false, false]);
    expect(result.points.map((point) => point.estimated)).toEqual([false, true, true, true]);
    expect(result.missingPeriods).toEqual(["2026-02"]);
    expect(result.imputedPeriods).toEqual(["2026-02"]);
    expect(result.endIndex).toBe(90);
    expect(buildIntervalIndex(incomplete, 0, "2026-01", "2026-04").endIndex).toBeNull();
    expect(incomplete.values).toEqual([[105], [90], [100]]);
  });

  it.each([null, 0, -1, NaN, Infinity])("marks invalid values as missing, not as observed flat data: %s", (value) => {
    const invalid = { ...shard, values: [[105], [value], [90], [100]] };
    expect(buildIntervalIndex(invalid, 0, "2026-01", "2026-04", true))
      .toMatchObject({ endIndex: 90, missingPeriods: ["2026-02"], imputedPeriods: ["2026-02"] });
  });

  it("handles consecutive gaps and a missing endpoint while counting only months after the base", () => {
    const incomplete = { ...shard, periods: ["2026-04"], values: [[110]] };
    const result = buildIntervalIndex(incomplete, 0, "2026-01", "2026-05", true);
    expect(result.points.slice(0, 3).map((point) => point.index)).toEqual([100, 100, 100]);
    expect(result.points[3]?.index).toBeCloseTo(110);
    expect(result.points[4]?.index).toBe(result.points[3]?.index);
    expect(result.imputedPeriods).toEqual(["2026-02", "2026-03", "2026-05"]);
    expect(result.endIndex).toBeCloseTo(110);
  });

  it("leaves complete data and same-month intervals unchanged when filling is enabled", () => {
    expect(buildIntervalIndex(shard, 0, "2026-01", "2026-04", true))
      .toEqual(buildIntervalIndex(shard, 0, "2026-01", "2026-04"));
    expect(buildIntervalIndex(shard, 0, "2025-01", "2025-01", true))
      .toMatchObject({ endIndex: 100, missingPeriods: [], imputedPeriods: [] });
    expect(buildIntervalIndex(shard, 0, "2025-01", "2025-03", true))
      .toMatchObject({ endIndex: 100, imputedPeriods: ["2025-02", "2025-03"] });
  });

  it("rejects YoY, invalid dates, reverse ranges and invalid city indices", () => {
    expect(() => buildIntervalIndex({ ...shard, id: "resale-all-yoy" }, 0, "2026-01", "2026-04")).toThrow("环比");
    expect(() => buildIntervalIndex(shard, 0, "2026-13", "2027-01")).toThrow(RangeError);
    expect(() => buildIntervalIndex(shard, 0, "2026-04", "2026-01")).toThrow(RangeError);
    expect(() => buildIntervalIndex(shard, -1, "2026-01", "2026-04")).toThrow(RangeError);
  });
});

describe("interval selection", () => {
  it("defaults to Beijing and five years ending in the latest MoM month", () => {
    expect(resolveIntervalSelection(manifest, descriptor)).toEqual({ city: "北京", start: "2021-08", end: "2026-08" });
  });

  it("retains valid explicit bounds and city", () => {
    const selection = { city: "广州", start: "2021-08", end: "2025-01" };
    expect(resolveIntervalSelection(manifest, descriptor, selection)).toEqual(selection);
  });

  it("clamps bounds to the selected housing dataset and sanitizes invalid URL values", () => {
    const short = { periods: ["2025-01", "2026-08"] } as DatasetDescriptor;
    expect(resolveIntervalSelection(manifest, short)).toEqual({ city: "北京", start: "2025-01", end: "2026-08" });
    expect(resolveIntervalSelection(manifest, short, { city: "不存在", start: "2021-01", end: "2030-01" }))
      .toEqual({ city: "北京", start: "2025-01", end: "2026-08" });
    expect(resolveIntervalSelection(manifest, descriptor, { start: "2026-13", end: "invalid" }))
      .toEqual({ city: "北京", start: "2021-08", end: "2026-08" });
    expect(resolveIntervalSelection(manifest, descriptor, { start: "2026-08", end: "2025-01" }))
      .toEqual({ city: "北京", start: "2025-01", end: "2025-01" });
  });
});

describe("interval line segments", () => {
  it("dashes only imputed transitions and keeps adjoining observed transitions solid", () => {
    const periods = completeMonths("2026-01", "2026-08");
    const alternating = { ...shard, periods, values: [105, 90, null, 100, null, null, 100, null].map((value) => [value]) };
    const result = buildIntervalIndex(alternating, 0, "2026-01", "2026-08", true);
    expect(intervalLineSegments(result.points)).toEqual([
      { imputed: false, data: [100, 90, null, null, null, null, null, null] },
      { imputed: true, data: [null, 90, 90, null, null, null, null, null] },
      { imputed: false, data: [null, null, 90, 90, null, null, null, null] },
      { imputed: true, data: [null, null, null, 90, 90, 90, null, null] },
      { imputed: false, data: [null, null, null, null, null, 90, 90, null] },
      { imputed: true, data: [null, null, null, null, null, null, 90, 90] },
    ]);
  });

  it("keeps a solid complete line or single base point, and never connects a strict data gap", () => {
    expect(intervalLineSegments(buildIntervalIndex(shard, 0, "2026-01", "2026-01").points))
      .toEqual([{ imputed: false, data: [100] }]);
    expect(intervalLineSegments(buildIntervalIndex(shard, 0, "2026-03", "2026-04").points))
      .toEqual([{ imputed: false, data: [100, 100] }]);
    const missing = { ...shard, values: [[105], [90], [null], [100]] };
    expect(intervalLineSegments(buildIntervalIndex(missing, 0, "2026-01", "2026-04").points))
      .toEqual([{ imputed: false, data: [100, 90, null, null] }]);
  });
});
