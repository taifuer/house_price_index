import type { DatasetDescriptor, DatasetShard } from "../types";
import { roundOne } from "./format";

export function historicalObservation(descriptor: DatasetDescriptor | undefined, loaded: Record<string, DatasetShard>, failures: string[], cityIndex: number, period: string) {
  if (!descriptor) return { status: "missing" as const, change: null };
  const shard = loaded[descriptor.id];
  if (!shard) return { status: failures.includes(descriptor.id) ? "failed" as const : "loading" as const, change: null };
  const value = shard.values[shard.periods.indexOf(period)]?.[cityIndex];
  return value == null || !Number.isFinite(value)
    ? { status: "missing" as const, change: null }
    : { status: "ready" as const, change: roundOne(value - 100) };
}
