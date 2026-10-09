import { expect, test } from "@playwright/test";
import type { DatasetShard, Manifest } from "../src/types";
import { formatPct } from "../src/lib/format";

test("search opens a single-city panorama and keeps all six observations faithful to source data", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?view=resale-all-yoy&period=2026-07");
  const search = page.locator(".search-toggle");
  await expect(search).toHaveAttribute("title", "搜索城市");
  await expect(page.locator(".header-tools button")).toHaveText(["", ""]);
  await search.click();
  const dialog = page.getByRole("dialog", { name: "搜索城市" });
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await dialog.getByRole("searchbox").fill("不存在");
  await expect(dialog.getByRole("status")).toHaveText("未找到城市");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(search).toBeFocused();
  await search.click();
  await dialog.getByRole("searchbox").fill("杭州");
  await page.screenshot({ path: `/tmp/house-city-search-${testInfo.project.name}.png` });
  await dialog.getByRole("searchbox").press("Enter");
  await expect(page.locator(".city-page-title")).toHaveText("杭州");
  await expect(page.locator(".city-trend-anchor")).toBeFocused();
  await expect(page.locator(".city-history-controls .city-tag-name")).toHaveText(["杭州"]);
  await expect(page.locator(".city-history-controls .city-tag-name")).toHaveText(["杭州"]);
  const table = page.getByRole("table", { name: "杭州当月住宅价格变化" });
  await expect(table.getByRole("columnheader")).toHaveText(["住宅类型", "环比", "同比", "累计平均同比"]);
  await expect(table.getByRole("rowheader")).toHaveText(["新建商品住宅", "二手住宅"]);
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const cityIndex = manifest.cities.findIndex((city) => city.name === "杭州");
  for (const descriptor of manifest.datasets.filter((dataset) => dataset.sizeBand === "全部")) {
    const shard = await (await page.request.get(`/data/${descriptor.path}`)).json() as DatasetShard;
    const value = shard.values[shard.periods.indexOf("2026-08")]![cityIndex]!;
    const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: descriptor.houseType, exact: true }) });
    const metricIndex = manifest.dimensions.metrics.indexOf(descriptor.metric);
    await expect(row.getByRole("cell").nth(metricIndex)).toHaveText(formatPct(value - 100));
  }
  await table.getByRole("button", { name: "查看杭州新建商品住宅同比走势", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "城市历史住宅类型" })).toHaveValue("新建商品住宅");
  await expect(page.getByRole("combobox", { name: "走势指标" })).toHaveValue("同比");
  await expect(page.locator(".interval-meta").first()).toContainText("新建商品住宅");
  await expect(page.locator(".city-snapshot-table button")).toHaveCount(6);
  await page.getByRole("navigation").getByRole("link", { name: "月度概览" }).click();
  await expect(page.locator(".section-title-meta")).toHaveText("二手住宅 · 同比 · 2026年7月");
  await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
  await page.getByRole("navigation").getByRole("link", { name: "城市看板" }).click();
  await page.reload();
  await expect(page.locator(".city-page-title")).toHaveText("杭州");
  await expect(page.getByRole("combobox", { name: "城市历史住宅类型" })).toHaveValue("新建商品住宅");
  expect(errors).toEqual([]);
});

test("city area and snapshot month filters do not alter national or chart time ranges", async ({ page }) => {
  await page.goto("/?section=cities&city=上海&view=resale-all-mom&period=2026-07");
  await page.locator(".filter-toggle").click();
  const drawer = page.getByRole("dialog", { name: "城市看板筛选" });
  await expect(drawer.getByRole("combobox")).toHaveCount(1);
  await expect(drawer.getByRole("combobox", { name: "住宅类型", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "完成" }).click();
  await page.getByRole("combobox", { name: "当月表现月份" }).selectOption("2026-01");
  await expect(page.locator(".city-snapshot-table tbody td")).toHaveCount(6);
  await expect(page.locator(".city-snapshot-table tbody tr td:last-child")).toHaveText(["—", "—"]);
  await expect(page.locator(".city-snapshot-table tbody button")).toHaveCount(4);
  await expect(page.locator(".city-history-controls").getByLabel("结束月份")).toHaveValue("2026-08");
  await page.locator(".filter-toggle").click();
  await drawer.getByRole("combobox", { name: "面积段", exact: true }).selectOption({ index: 1 });
  await drawer.getByRole("button", { name: "完成" }).click();
  await expect(page.locator(".section-title-meta")).toContainText("90m²及以下");
  await expect(page.locator(".city-snapshot-table tbody button")).toHaveCount(4);
  await page.getByRole("combobox", { name: "城市历史住宅类型" }).selectOption("新建商品住宅");
  await expect(page.getByRole("combobox", { name: "城市历史住宅类型" })).toHaveValue("新建商品住宅");
  await page.getByRole("navigation").getByRole("link", { name: "月度概览" }).click();
  await expect(page.locator(".section-title-meta")).toHaveText("二手住宅 · 环比 · 2026年7月");
  await page.getByRole("navigation").getByRole("link", { name: "城市看板" }).click();
  await page.reload();
  await expect(page.locator(".section-title-meta")).toContainText("90m²及以下");
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-01");
  await expect(page.getByRole("combobox", { name: "城市历史住宅类型" })).toHaveValue("新建商品住宅");
});

test("partial request failures do not blank other city observations", async ({ page }) => {
  await page.route("**/data/shards/new-all-yoy.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/?section=cities&city=北京&view=resale-all-mom");
  const table = page.locator(".city-snapshot-table");
  await expect(table.getByText("加载失败", { exact: true })).toHaveCount(1);
  await expect(table.getByRole("button")).toHaveCount(5);
  await expect(page.locator(".city-trend-chart .chart-canvas svg")).toBeVisible();
  await expect(page.locator(".interval-index-chart .chart-canvas svg")).toBeVisible();
});

test("city drilldown carries monthly context and search visits support browser back", async ({ page }) => {
  await page.goto("/?view=new-under-90-mom&period=2026-07");
  await page.locator(".city-overview").getByRole("button", { name: /^北京，/ }).click();
  await expect(page.locator(".city-page-title")).toHaveText("北京");
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-07");
  await expect(page.getByRole("combobox", { name: "城市历史住宅类型" })).toHaveValue("新建商品住宅");
  await expect(page.locator(".section-title-meta")).toHaveText("90m²及以下");
  await page.locator(".search-toggle").click();
  const search = page.getByRole("dialog", { name: "搜索城市" }).getByRole("searchbox");
  await search.fill("杭州");
  await search.press("ArrowDown");
  await expect(page.getByRole("dialog", { name: "搜索城市" }).getByRole("button", { name: "杭州", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".city-page-title")).toHaveText("杭州");
  await page.goBack();
  await expect(page.locator(".city-page-title")).toHaveText("北京");
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-07");
  await page.goBack();
  await expect(page.locator(".section-title-meta")).toHaveText("新建商品住宅 · 90m²及以下 · 环比 · 2026年7月");
});

test("city controls fit narrow screens and header tools sit to the right of navigation on desktop", async ({ page }, testInfo) => {
  await page.goto("/?section=cities&city=乌鲁木齐&cityDataset=new-all-average");
  await expect(page.locator(".city-snapshot-table button")).toHaveCount(6);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const overflows = await page.locator(".city-snapshot-table th, .city-snapshot-table td").evaluateAll((cells) => cells.filter((cell) => {
      const bounds = cell.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(cell);
      const text = range.getBoundingClientRect();
      return text.right > bounds.right + 1 || text.left < bounds.left - 1;
    }).map((cell) => cell.textContent));
    expect(overflows).toEqual([]);
    const title = (await page.locator(".city-page-title").boundingBox())!;
    const context = (await page.locator(".city-page-heading .section-title-meta").boundingBox())!;
    expect(title.x + title.width).toBeLessThanOrEqual(context.x);
    if (width >= 768) {
      const nav = (await page.getByRole("navigation").boundingBox())!;
      const tools = (await page.locator(".header-tools").boundingBox())!;
      expect(nav.x).toBeGreaterThan(width / 2);
      expect(tools.x - nav.x - nav.width).toBeGreaterThanOrEqual(0);
      expect(tools.x - nav.x - nav.width).toBeLessThanOrEqual(20);
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/house-city-data-${width}-${testInfo.project.name}.png`, fullPage: true });
  }
});
