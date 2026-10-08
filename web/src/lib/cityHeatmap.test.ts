import { describe, expect, it } from "vitest";

import { heatmapColor, heatmapHeight, heatmapLegendLabels, heatmapLimit } from "./cityHeatmap";

describe("city heatmap presentation", () => {
  it("uses fixed, zero-centred scales for each metric", () => {
    expect(heatmapLimit("环比")).toBe(1);
    expect(heatmapLimit("同比")).toBe(10);
    expect(heatmapLimit("累计平均")).toBe(10);
    expect(heatmapColor(0, "环比")).toBe(heatmapColor(0, "同比"));
    expect(heatmapColor(0.1, "环比")).toBe(heatmapColor(1, "同比"));
    expect(heatmapLegendLabels("环比")).toEqual(["≤ -1.0%", "0.0%", "≥ +1.0%"]);
  });

  it("clips colour intensity at labelled endpoints, not observations", () => {
    expect(heatmapColor(1, "环比")).toBe(heatmapColor(7.2, "环比"));
    expect(heatmapColor(-1, "环比")).toBe(heatmapColor(-7.2, "环比"));
    expect(heatmapColor(-0.2, "环比")).not.toBe(heatmapColor(-0.4, "环比"));
  });

  it("distinguishes missing values from zero", () => {
    expect(heatmapColor(null, "环比")).not.toBe(heatmapColor(0, "环比"));
  });

  it("keeps city rows legible without a fixed-height viewport", () => {
    expect(heatmapHeight(4, false)).toBe(238);
    expect(heatmapHeight(70, false)).toBeGreaterThan(1400);
    expect(heatmapHeight(70, true)).toBeGreaterThan(heatmapHeight(70, false));
    expect(heatmapHeight(35, false) - heatmapHeight(31, false)).toBe(4 * 21);
  });
});
