/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { DatasetShard, Manifest } from "../types";
import { validateManifest, validateShard } from "./dataValidation";
import manifestJson from "../../public/data/manifest.json";

const manifest = manifestJson as Manifest;
const descriptor = manifest.datasets.find((d) => d.id === "resale-all-mom")!;
const fixtures = import.meta.glob<DatasetShard>("../../public/data/shards/*.json", { eager: true, import: "default" });
const shard = fixtures[`../../public/data/${descriptor.path}`]!;

describe("published data validation", () => {
  it("accepts all published shards, including historical gaps and partial coverage", () => {
    expect(validateManifest(manifest)).toEqual(manifest);
    for (const d of manifest.datasets) {
      const value = fixtures[`../../public/data/${d.path}`]!;
      expect(validateShard(value, d, manifest.cities.length)).toEqual(value);
    }
  });

  it.each([
    (m: Manifest) => { m.schemaVersion = 99; },
    (m: Manifest) => { m.periodRange[1] = "2099-01"; },
    (m: Manifest) => { m.generatedAt = "invalid"; },
    (m: Manifest) => { m.cities[1] = m.cities[0]!; },
    (m: Manifest) => { m.datasets[0]!.path = "https://example.com/data.json"; },
    (m: Manifest) => { m.datasets[0]!.path = "shards/../manifest.json"; },
    (m: Manifest) => { m.datasets[1] = m.datasets[0]!; },
    (m: Manifest) => { m.datasets[0]!.periods.reverse(); },
    (m: Manifest) => { m.datasets[0]!.periodCoverage[0] = 71; },
    (m: Manifest) => { m.datasets[0]!.coverage.completeMonths++; },
    (m: Manifest) => { m.recordCount++; },
  ])("rejects malformed manifest %#", (corrupt) => {
    const copy = structuredClone(manifest); corrupt(copy);
    expect(() => validateManifest(copy)).toThrow();
  });

  it.each([
    (s: DatasetShard) => { s.id = "new-all-mom"; },
    (s: DatasetShard) => { s.periods.pop(); },
    (s: DatasetShard) => { s.values[0]!.pop(); },
    (s: DatasetShard) => { s.values[0]![0] = Infinity; },
    (s: DatasetShard) => { s.values[0]![0] = -1; },
    (s: DatasetShard) => { s.values[0] = Array(70).fill(null); },
    (s: DatasetShard) => { s.recordCount++; },
    (s: DatasetShard) => { s.sources.pop(); },
    (s: DatasetShard) => { s.sources[0]!.url = "https://stats.gov.cn.evil.test/page"; },
    (s: DatasetShard) => { s.sources[0]!.url = "javascript:alert(1)"; },
    (s: DatasetShard) => { s.sources[0]!.url = "https://user@www.stats.gov.cn/page"; },
  ])("rejects malformed shard %#", (corrupt) => {
    const copy = structuredClone(shard); corrupt(copy);
    expect(() => validateShard(copy, descriptor, 70)).toThrow();
  });
});
