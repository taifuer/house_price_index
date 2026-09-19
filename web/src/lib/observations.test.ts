import { describe, expect, it } from "vitest";

import type { DatasetShard, Manifest } from "../types";
import { completeMonths, periodsForRange } from "./format";
import { buildObservations, sortObservations } from "./observations";

const manifest = {
  cities: [
    { name: "北京", tier: "一线" },
    { name: "上海", tier: "一线" },
    { name: "天津", tier: "二线" },
  ],
} as Manifest;
const source = { url: "https://www.stats.gov.cn/example", title: '价格指数,"原文"\n2026' };
const shard: DatasetShard = {
  schemaVersion: 1, id: "resale-all-mom", recordCount: 5,
  periods: ["2026-01", "2026-03"], sources: [source, source],
  values: [[100.2, 100, 99.8], [99.9, null, 100.1]],
};

describe("observation tables", () => {
  it("preserves original indices and distinguishes missing data from zero growth", () => {
    const rows = buildObservations(manifest, shard, ["2026-01", "2026-03"]);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ city: "北京", value: 100.2, change: 0.2, source });
    expect(rows[1]).toMatchObject({ city: "上海", value: 100, change: 0 });
    expect(rows[4]).toMatchObject({ city: "上海", value: null, change: null, source });
  });

  it("retains absent months and only returns selected cities", () => {
    const rows = buildObservations(manifest, shard, completeMonths("2026-01", "2026-03"), ["上海"]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ period: "2026-02", city: "上海", tier: "一线", value: null, change: null, source: undefined });
    expect(buildObservations(manifest, shard, shard.periods, [])).toEqual([]);
    expect(buildObservations(manifest, shard, shard.periods, ["不存在"])).toEqual([]);
  });

  it("uses the same calendar range as the city chart", () => {
    const periods = periodsForRange(completeMonths("2020-01", "2026-03"), "3y");
    const rows = buildObservations(manifest, shard, periods, ["北京", "天津"]);
    expect(rows).toHaveLength(72);
    expect(rows[0]?.period).toBe("2023-04");
    expect(rows.at(-1)?.period).toBe("2026-03");
  });

  it("sorts numbers numerically, missing values last in both directions, without mutating rows", () => {
    const rows = buildObservations(manifest, shard, ["2026-03"]);
    expect(sortObservations(rows, { key: "value", direction: "asc" }).map((row) => row.value)).toEqual([99.9, 100.1, null]);
    expect(sortObservations(rows, { key: "change", direction: "desc" }).map((row) => row.change)).toEqual([0.1, -0.1, null]);
    expect(rows.map((row) => row.city)).toEqual(["北京", "上海", "天津"]);
  });

  it("defaults history to newest month and sorts tiers in tier order", () => {
    const rows = buildObservations(manifest, shard, shard.periods);
    expect(sortObservations(rows, { key: "period", direction: "desc" }).map((row) => row.period)).toEqual([
      "2026-03", "2026-03", "2026-03", "2026-01", "2026-01", "2026-01",
    ]);
    expect(sortObservations(rows, { key: "tier", direction: "asc" }).at(-1)?.tier).toBe("二线");
  });

});
