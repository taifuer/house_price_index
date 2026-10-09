import { describe, expect, it } from "vitest";
import type { DatasetDescriptor, DatasetShard } from "../types";
import { historicalObservation } from "./cityHistory";

const descriptor = { id: "resale-all-yoy" } as DatasetDescriptor;
const shard = { id: descriptor.id, periods: ["2026-01", "2026-03"], values: [[99.1, 100], [null, 100.4]] } as DatasetShard;
const loaded = { [descriptor.id]: shard };

describe("historical observations", () => {
  it("uses published values and rounds floating point differences", () => {
    expect(historicalObservation(descriptor, loaded, [], 0, "2026-01")).toEqual({ status: "ready", change: -0.9 });
    expect(historicalObservation(descriptor, loaded, [], 1, "2026-03").change).toBe(0.4);
    expect(historicalObservation(descriptor, loaded, [], 1, "2026-01")).toEqual({ status: "ready", change: 0 });
  });
  it("never fills missing cells or missing calendar months with flat values", () => {
    expect(historicalObservation(descriptor, loaded, [], 0, "2026-02")).toEqual({ status: "missing", change: null });
    expect(historicalObservation(descriptor, loaded, [], 0, "2026-03")).toEqual({ status: "missing", change: null });
  });
  it("distinguishes loading, request failures and unavailable metrics", () => {
    expect(historicalObservation(descriptor, {}, [], 0, "2026-01").status).toBe("loading");
    expect(historicalObservation(descriptor, {}, [descriptor.id], 0, "2026-01").status).toBe("failed");
    expect(historicalObservation(undefined, {}, [], 0, "2026-01").status).toBe("missing");
  });
});
