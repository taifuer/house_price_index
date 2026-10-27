import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { DatasetShard, Manifest } from "../src/types";
import { mockShards } from "./data-fixture";

const manifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8")) as Manifest;
const readShard = (id: string) => JSON.parse(readFileSync(`public/data/shards/${id}.json`, "utf8")) as DatasetShard;

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => { throw error; });
});

for (const failure of ["unavailable", "invalid"] as const) {
  test(`recovers from an ${failure} manifest without a document reload`, async ({ page }) => {
    let attempts = 0, documents = 0;
    page.on("request", (request) => { if (request.resourceType() === "document") documents++; });
    await page.route("**/data/manifest.json", (route) => {
      attempts++;
      if (attempts === 1) return failure === "unavailable"
        ? route.fulfill({ status: 503, body: "Unavailable" })
        : route.fulfill({ json: { ...manifest, schemaVersion: 99 } });
      return route.fulfill({ json: manifest });
    });
    await page.goto("/?period=2026-07");
    await expect(page.getByRole("alert")).toContainText(failure === "unavailable" ? "503" : "数据校验失败");
    await page.getByRole("button", { name: "重新加载数据" }).click();
    await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
    await expect(page.getByRole("combobox", { name: "概览月份" })).toHaveValue("2026-07");
    expect(attempts).toBe(2);
    expect(documents).toBe(1);
  });
}

test("retries the overview shard and changes month and source without refetching", async ({ page }) => {
  let attempts = 0;
  const shard = readShard("resale-all-mom");
  await page.route("**/data/shards/resale-all-mom.json*", (route) => ++attempts === 1
    ? route.fulfill({ status: 503, body: "Unavailable" }) : route.fulfill({ json: shard }));
  await page.goto("/?view=resale-all-mom&period=2026-07");
  await page.getByRole("button", { name: "重新加载数据" }).click();
  await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
  await page.getByRole("combobox", { name: "概览月份" }).selectOption("2026-06");
  await expect(page.locator(".summary-context a")).toHaveAttribute("href", shard.sources[shard.periods.indexOf("2026-06")]!.url);
  await expect(page).toHaveURL(/period=2026-06/);
  expect(attempts).toBe(2);
  await expect(page.locator(".section-meta-row a")).toHaveCount(0);
});

test("recovers a rejected city shard while retaining the other five and limiting concurrency", async ({ page }) => {
  const counts = new Map<string, number>();
  let active = 0, maximum = 0;
  await page.route("**/data/shards/*.json*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!.replace(".json", "");
    const count = (counts.get(id) ?? 0) + 1;
    counts.set(id, count);
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const shard = readShard(id);
    if (id === "new-all-yoy" && count === 1) shard.values[0]!.pop();
    active--;
    await route.fulfill({ json: shard });
  });
  await page.goto("/?section=cities&city=北京&cityPeriod=2026-08");
  const snapshot = page.locator(".city-snapshot");
  await expect(snapshot).toHaveAttribute("aria-busy", "false");
  await expect(snapshot.locator(".snapshot-value")).toHaveCount(5);
  await expect(snapshot.getByText("加载失败", { exact: true })).toHaveCount(1);
  const values = await snapshot.locator(".snapshot-value").allTextContents();
  await snapshot.getByRole("button", { name: "重新加载数据" }).click();
  await expect(snapshot.locator(".snapshot-value")).toHaveCount(6);
  expect(await snapshot.locator(".snapshot-value").allTextContents()).toEqual(expect.arrayContaining(values));
  await expect(snapshot.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-08");
  expect([...counts.values()].sort()).toEqual([1, 1, 1, 1, 1, 2]);
  expect(maximum).toBe(3);
});

test("retries a failed companion metric without discarding the overview", async ({ page }) => {
  let attempts = 0;
  await page.route("**/data/shards/resale-all-yoy.json*", (route) => ++attempts === 1
    ? route.fulfill({ status: 503, body: "Unavailable" }) : route.fulfill({ json: readShard("resale-all-yoy") }));
  await page.goto("/?view=resale-all-mom");
  await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
  const summary = await page.locator(".summary-item strong").allTextContents();
  await page.getByRole("button", { name: "重新加载数据" }).click();
  await expect(page.locator(".quadrant-chart .chart-canvas svg")).toBeVisible();
  await expect(page.locator(".summary-item strong")).toHaveText(summary);
  expect(attempts).toBe(2);
});

test("migrates breadth links and keeps fully missing observations distinct from flat data", async ({ page }, testInfo) => {
  const shard = readShard("resale-all-mom");
  shard.values[shard.periods.indexOf("2026-07")] = Array(70).fill(null);
  await mockShards(page, [shard]);
  await page.goto("/?section=history&trend=breadth&view=resale-all-mom&period=2026-07&range=3y");
  const trend = page.locator(".overall-trend-chart");
  await expect(trend.getByRole("button", { name: "总体", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(trend.getByRole("button", { name: "广度", exact: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/breadth/);
  await expect(trend.locator(".trend-note")).toContainText("斜纹为缺失");
  await expect(trend.locator("svg pattern")).not.toHaveCount(0);
  await trend.screenshot({ path: `/tmp/house-missing-overall-${testInfo.project.name}.png` });
  await trend.getByRole("button", { name: "分层", exact: true }).click();
  await expect(trend.locator("svg pattern")).not.toHaveCount(0);
  await trend.screenshot({ path: `/tmp/house-missing-tier-${testInfo.project.name}.png` });
  await page.getByRole("navigation").getByRole("link", { name: "月度概览" }).click();
  await expect(page.locator(".summary-item strong")).toHaveText(["0/70", "0", "0", "0", "—", "—", "—"]);
  await expect(page.locator(".summary-context")).toContainText("本期缺少 70 城");
});
