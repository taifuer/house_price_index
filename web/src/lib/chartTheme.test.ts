import { describe, expect, it } from "vitest";

import { symmetricScale } from "./chartTheme";

describe("symmetricScale", () => {
  it("centers small monthly changes on readable quarter-point ticks", () => {
    expect(symmetricScale([-0.9, 0.4], 0.5)).toEqual({
      minimum: -1,
      maximum: 1,
      interval: 0.5,
    });
  });

  it("keeps larger annual changes centered without edge-only labels", () => {
    expect(symmetricScale([-9.4, -1.2], 1)).toEqual({
      minimum: -10,
      maximum: 10,
      interval: 5,
    });
  });
});
