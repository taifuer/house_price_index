import { describe, expect, it } from "vitest";
import type { Manifest } from "../types";
import { dashboardSearch, readDashboardState } from "./dashboardState";

const manifest = {
  defaultDataset: "resale-all-mom",
  periodRange: ["2021-08", "2026-08"],
  cities: ["北京", "上海", "广州", "深圳", "杭州", "南京"].map((name) => ({ name, tier: "一线" })),
  datasets: ["mom", "yoy"].map((metric) => ({
    id: `resale-all-${metric}`, houseType: "二手住宅", sizeBand: "全部",
    metric: metric === "mom" ? "环比" : "同比", periods: ["2021-08", "2026-07", "2026-08"],
  })),
} as Manifest;

describe("dashboard URL state", () => {
  it("opens old monthly links in overview and keeps the dataset view parameter unchanged", () => {
    const state = readDashboardState(manifest, "?view=resale-all-yoy&period=2026-07");
    expect(state).toMatchObject({ section: "overview", datasetId: "resale-all-yoy", period: "2026-07", heatmapRange: "3y" });
    expect(dashboardSearch(manifest, state)).toBe("?view=resale-all-yoy&period=2026-07&cityDataset=resale-all-yoy");
  });

  it("round-trips independent task controls, including explicit empty city selections", () => {
    const state = readDashboardState(manifest, "?section=history&view=resale-all-yoy&period=2026-07&trend=tier&range=5y&heatmapRange=all&heatmapTier=二线&overviewTier=一线&cityRange=3y&cities=&indexCities=&indexStart=2026-07&indexEnd=2026-08");
    expect(readDashboardState(manifest, dashboardSearch(manifest, state))).toEqual(state);
    expect(state).toMatchObject({ selectedCities: [], heatmapTier: "二线", intervalSelection: { cities: [] } });
  });

  it("validates unknown or malformed filters and migrates legacy interval parameters", () => {
    const state = readDashboardState(manifest, "?section=invalid&view=bad&period=2099-01&heatmapRange=1y&heatmapTier=四线&range=bad&trend=bad&cities=北京,北京,不存在&indexCity=上海&indexFill=strict");
    expect(state).toMatchObject({ section: "overview", datasetId: "resale-all-mom", period: "2026-08", heatmapRange: "3y", heatmapTier: "全部", selectedCities: ["北京"], intervalSelection: { cities: ["上海"] } });
    const search = dashboardSearch(manifest, state, "?campaign=shared&indexCity=上海&indexFill=strict");
    expect(search).toContain("campaign=shared");
    expect(search).not.toContain("indexCity=");
    expect(search).not.toContain("indexFill=");
    expect(readDashboardState(manifest, search)).toEqual(state);
  });

  it("preserves selections when only the active section changes", () => {
    const state = readDashboardState(manifest, "?period=2026-07&cities=杭州,南京&indexCities=上海&indexStart=2026-07");
    for (const section of ["history", "cities", "overview"] as const) {
      expect(readDashboardState(manifest, dashboardSearch(manifest, { ...state, section }))).toEqual({ ...state, section });
    }
  });

  it("keeps city data independent from national filters, including after sharing or reloading", () => {
    const initial = readDashboardState(manifest, "?section=cities&city=杭州&cityDataset=resale-all-yoy&cityPeriod=2026-07&view=resale-all-mom");
    expect(initial).toMatchObject({ city: "杭州", selectedCities: ["杭州"], cityDatasetId: "resale-all-yoy", cityPeriod: "2026-07", period: "2026-08" });
    const next = { ...initial, section: "overview" as const, datasetId: "resale-all-yoy", period: "2021-08" };
    expect(readDashboardState(manifest, dashboardSearch(manifest, next))).toEqual(next);
  });

  it("sanitizes city parameters and defaults to a single primary city", () => {
    expect(readDashboardState(manifest, "?city=不存在&cityDataset=missing&cityPeriod=1900-01&indexHouse=unknown"))
      .toMatchObject({ city: "北京", selectedCities: ["北京"], cityDatasetId: "resale-all-mom", cityPeriod: "2026-08", indexHouseType: "二手住宅" });
  });
});
