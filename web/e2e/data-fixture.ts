import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { DatasetShard, Manifest } from "../src/types";
import { completeMonths } from "../src/lib/format";
import { validateManifest, validateShard } from "../src/lib/dataValidation";

// Missing-data fixtures must keep the published manifest and shards consistent.
export async function mockShards(page: Page, shards: DatasetShard[]) {
  const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8")) as Manifest;
  for (const shard of shards) {
    const descriptor = manifest.datasets.find((d) => d.id === shard.id)!;
    descriptor.periods = [...shard.periods];
    descriptor.periodCoverage = shard.values.map((row) => row.filter((n) => n !== null).length);
    descriptor.recordCount = shard.recordCount = descriptor.periodCoverage.reduce((sum, n) => sum + n, 0);
    const complete = shard.periods.filter((_, i) => descriptor.periodCoverage[i] === manifest.cities.length);
    descriptor.coverage = {
      firstPeriod: shard.periods[0]!, lastPeriod: shard.periods.at(-1)!, publishedMonths: shard.periods.length,
      completeMonths: complete.length, partialMonths: descriptor.periodCoverage.filter((n) => n > 0 && n < manifest.cities.length).length,
      unpublishedMonths: completeMonths(shard.periods[0]!, shard.periods.at(-1)!).length - shard.periods.length,
      lastCompletePeriod: complete.at(-1) ?? null,
    };
    validateShard(shard, descriptor, manifest.cities.length);
    await page.route(`**/data/${descriptor.path}*`, (route) => route.fulfill({ json: shard }));
  }
  manifest.recordCount = manifest.datasets.reduce((sum, d) => sum + d.recordCount, 0);
  validateManifest(manifest);
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: manifest }));
}
