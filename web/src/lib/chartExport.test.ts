import { describe, expect, it } from "vitest";
import { exportDimensions, wrapExportText } from "./chartExport";

describe("chart export sizing", () => {
  it("uses 2x output for ordinary charts and bounds long images", () => {
    expect(exportDimensions(760, 600)).toEqual({ width: 1520, height: 1200, scale: 2 });
    for (const [width, height] of [[960, 1600], [1280, 4000], [760, 8000]]) {
      const result = exportDimensions(width!, height!);
      expect(result.width).toBeLessThanOrEqual(4096);
      expect(result.height).toBeLessThanOrEqual(4096);
      expect(result.width * result.height).toBeLessThanOrEqual(4_000_000);
      expect(Math.abs(result.width / result.height - width! / height!)).toBeLessThan(0.002);
    }
  });

  it("rejects empty or invalid chart dimensions", () => {
    for (const value of [0, -1, NaN, Infinity]) expect(() => exportDimensions(value, 600)).toThrow();
  });

  it("wraps Chinese metadata and missing-data notes without truncation", () => {
    const text = "北京、上海 · 二手住宅 · 同比 · 2021-08 - 2026-08";
    const lines = wrapExportText(text, 10, (value) => [...value].length);
    expect(lines.every((line) => [...line].length <= 10)).toBe(true);
    expect(lines.join("").replaceAll(" ", "")).toBe(text.replaceAll(" ", ""));
    expect(wrapExportText("缺失月份\n按持平填补", 10, (value) => value.length)).toEqual(["缺失月份", "按持平填补"]);
    expect(wrapExportText("缺失：2020年", 6, (value) => value.length)).toEqual(["缺失：", "2020年"]);
  });
});
