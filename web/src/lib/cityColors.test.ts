import { describe, expect, it } from "vitest";

import { CITY_SERIES_COLORS, reconcileCityColors } from "./cityColors";

describe("city series colors", () => {
  it("assigns ten unique colors", () => {
    const cities = Array.from({ length: 10 }, (_, index) => `城市${index + 1}`);
    const assignments = reconcileCityColors(cities, new Map());

    expect(assignments.size).toBe(10);
    expect(new Set(assignments.values()).size).toBe(10);
    expect([...assignments.values()]).toEqual(CITY_SERIES_COLORS);
  });

  it("keeps remaining city colors stable when selections change", () => {
    const initial = reconcileCityColors(["北京", "上海", "广州"], new Map());
    const updated = reconcileCityColors(["上海", "广州", "深圳"], initial);

    expect(updated.get("上海")).toBe(initial.get("上海"));
    expect(updated.get("广州")).toBe(initial.get("广州"));
    expect(updated.get("深圳")).toBe(CITY_SERIES_COLORS[0]);
    expect(new Set(updated.values()).size).toBe(updated.size);
  });
});
