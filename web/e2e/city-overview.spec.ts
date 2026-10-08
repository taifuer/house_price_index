import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { DatasetShard, Manifest } from "../src/types";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw error; });
  await page.goto("/?view=resale-all-mom&period=2026-08");
  await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
});

test("shows every city in equal-sized tier groups without a chart viewport", async ({ page }, testInfo) => {
  const overview = page.locator(".city-overview");
  await expect(overview.getByRole("button", { name: "数据表", exact: true })).toHaveCount(0);
  await expect(overview.getByRole("table")).toHaveCount(0);
  await expect(overview.locator(".city-matrix-cell > span").first()).toHaveCSS("font-size", "13px");
  await expect(overview.locator(".city-matrix-cell > strong").first()).toHaveCSS("font-size", "14px");
  const groups = overview.locator(".city-matrix-tier");
  await expect(groups.locator("h4")).toHaveText(["一线4城", "二线31城", "三线35城"]);
  const dimensions = await overview.locator(".city-matrix-cell").evaluateAll((cells) => cells.map((cell) => {
    const rect = cell.getBoundingClientRect();
    return { width: rect.width, height: rect.height, overflow: cell.scrollWidth > cell.clientWidth };
  }));
  expect(dimensions.every((cell) => !cell.overflow && cell.height >= 44)).toBe(true);
  expect(Math.max(...dimensions.map((cell) => cell.width)) - Math.min(...dimensions.map((cell) => cell.width))).toBeLessThan(1);
  expect(await overview.locator(".city-matrix-grid").first().evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length)).toBe(testInfo.project.name === "mobile" ? 4 : 12);
  await expect(overview.getByRole("button", { name: /^乌鲁木齐，/ })).toBeVisible();
  const before = await overview.locator(".city-matrix-cell > span").allTextContents();
  await page.locator(".filter-toggle").click();
  await page.locator(".filter-list label").nth(0).locator("select").selectOption("2026-07");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(overview.locator(".city-matrix-cell > span")).toHaveText(before);
  await page.addStyleTag({ content: ".app-header, .scroll-jump { visibility: hidden !important; }" });
  await overview.screenshot({ path: `/tmp/house-matrix-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("matrix supports keyboard city navigation and preserves the overview on return", async ({ page }) => {
  const overview = page.locator(".city-overview");
  const city = overview.getByRole("button", { name: /^北京，/ });
  await city.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/section=cities/);
  await expect(page.locator(".city-page-title")).toHaveText("北京");
  await expect(page.locator(".city-trend-anchor")).toBeFocused();
  await page.getByRole("navigation").getByRole("link", { name: "月度概览" }).click();
  await expect(overview.locator(".city-matrix-cell")).toHaveCount(70);
  await overview.getByRole("button", { name: "一线", exact: true }).click();
  await expect(overview.locator(".city-matrix-cell")).toHaveCount(4);
});

test("matrix exports a complete PNG on desktop and hides download on mobile", async ({ page }, testInfo) => {
  const button = page.locator(".city-overview").getByRole("button", { name: "下载图表" });
  if (testInfo.project.name === "mobile") {
    await expect(button).toHaveCount(0);
    return;
  }
  const matrix = page.locator(".city-matrix");
  await matrix.hover();
  await expect(matrix.locator(".chart-actions")).toHaveCSS("opacity", "1");
  const matrixBox = (await matrix.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  expect(buttonBox.y - matrixBox.y).toBeLessThan(12);
  expect(matrixBox.x + matrixBox.width - buttonBox.x - buttonBox.width).toBeLessThan(12);
  for (const label of ["一线", "二线", "三线"]) {
    await page.locator(".city-overview").getByRole("button", { name: label, exact: true }).click();
    const action = (await button.boundingBox())!;
    const firstCell = (await matrix.locator(".city-matrix-cell").first().boundingBox())!;
    expect(action.y + action.height).toBeLessThanOrEqual(firstCell.y);
  }
  await page.locator(".city-overview").getByRole("button", { name: "全部", exact: true }).click();
  const pending = page.waitForEvent("download");
  await button.click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/城市涨跌\.png$/);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(20_000);
  await download.saveAs("/tmp/house-matrix-export.png");
});

test("heatmap displays all city rows and the actual selected date range", async ({ page }, testInfo) => {
  await page.getByRole("navigation").getByRole("link", { name: "历史趋势" }).click();
  const heatmap = page.locator(".heatmap-chart");
  const canvas = heatmap.locator(".chart-canvas");
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const descriptor = manifest.datasets.find((item) => item.id === "resale-all-mom")!;
  const shard = await (await page.request.get(`/data/${descriptor.path}`)).json() as DatasetShard;
  const cityNames = manifest.cities.map((city) => city.name);
  await expect(canvas.locator("svg")).toBeVisible();
  await expect.poll(() => canvas.locator('svg path[fill^="rgb"]').count()).toBeGreaterThan(2000);
  const renderedCities = await canvas.locator("svg text").allTextContents();
  expect(renderedCities.filter((text) => cityNames.includes(text))).toEqual(cityNames);
  const allHeight = (await canvas.boundingBox())!.height;
  expect(allHeight).toBeGreaterThan(1400);
  const range = heatmap.getByRole("group", { name: "热力图时间范围" });
  const tier = heatmap.getByRole("group", { name: "热力图城市层级" });
  await expect(canvas.locator("svg text").filter({ hasText: /^2023-09$/ })).toHaveCount(2);
  await expect(canvas.locator("svg text").filter({ hasText: /^2026-08$/ })).toHaveCount(2);
  for (const [label, firstPeriod] of [["近5年", "2021-09"], ["近10年", "2016-09"], ["全部", shard.periods[0]!]]) {
    await range.getByRole("button", { name: label, exact: true }).click();
    await expect(canvas.locator("svg text").filter({ hasText: firstPeriod }).first()).toBeVisible();
    await expect(canvas.locator("svg text").filter({ hasText: /^2026-08$/ }).first()).toBeVisible();
    await expect(canvas.locator("svg text").filter({ hasText: "≥ +1.0%" })).toHaveCount(1);
  }
  await expect(heatmap.locator(".trend-note")).toContainText("不计作持平");
  await range.getByRole("button", { name: "近3年", exact: true }).click();
  await page.addStyleTag({ content: ".app-header, .scroll-jump { visibility: hidden !important; }" });
  await heatmap.screenshot({ path: `/tmp/house-heatmap-all-${testInfo.project.name}.png` });
  await tier.getByRole("button", { name: "一线", exact: true }).click();
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeLessThan(300);
  await heatmap.screenshot({ path: `/tmp/house-heatmap-tier1-${testInfo.project.name}.png` });
  await tier.getByRole("button", { name: "全部", exact: true }).click();
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(allHeight);
});

test("keeps missing cities distinct from flat values and preserves unclipped tooltips", async ({ page }, testInfo) => {
  await page.route("**/data/shards/resale-all-mom.json", async (route) => {
    const response = await route.fetch();
    const shard = await response.json() as DatasetShard;
    const row = shard.values[shard.periods.indexOf("2026-08")]!;
    row[0] = null;
    row[1] = 100;
    row[2] = 102.2;
    await route.fulfill({ json: shard });
  });
  await page.reload();
  const missing = page.locator(".city-overview").getByRole("button", { name: "北京，缺失，查看走势", exact: true });
  const flat = page.locator(".city-overview").getByRole("button", { name: "上海，环比 0.0%，查看走势", exact: true });
  await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
  await expect(missing).toContainText("—");
  await expect(missing).toHaveClass(/is-missing/);
  expect(await missing.evaluate((cell) => getComputedStyle(cell).backgroundColor)).not.toBe(await flat.evaluate((cell) => getComputedStyle(cell).backgroundColor));
  await page.getByRole("navigation").getByRole("link", { name: "历史趋势" }).click();
  await expect(page.locator(".heatmap-chart .trend-note")).toContainText("1 个月份存在缺失");
  await expect(page.locator(".heatmap-chart svg pattern").first()).toBeAttached();
  const heatmap = page.locator(".heatmap-chart");
  await heatmap.getByRole("group", { name: "热力图城市层级" }).getByRole("button", { name: "一线", exact: true }).click();
  const canvas = heatmap.locator(".chart-canvas");
  const { width, height } = (await canvas.boundingBox())!;
  const left = testInfo.project.name === "mobile" ? 58 : 62;
  const right = testInfo.project.name === "mobile" ? 26 : 30;
  const x = width - right - (width - left - right) / 72;
  for (const [row, label] of [[0, "无数据"], [1, "0.0%"], [2, "+2.2%"]] as const) {
    await canvas.click({ position: { x, y: 48 + (row + 0.5) * (height - 154) / 4 } });
    await expect(canvas.getByText(`环比 ${label}`, { exact: false })).toBeVisible();
  }
});

test("matrix text and heatmap date labels fit narrow and tablet viewports", async ({ page }) => {
  const heatmap = page.locator(".heatmap-chart");
  await page.getByRole("navigation").getByRole("link", { name: "历史趋势" }).click();
  await heatmap.getByRole("group", { name: "热力图城市层级" }).getByRole("button", { name: "一线", exact: true }).click();
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("navigation").getByRole("link", { name: "月度概览" }).click();
    await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const textOverflows = await page.locator(".city-matrix-cell").evaluateAll((cells) => cells.filter((cell) => {
      const rect = cell.getBoundingClientRect();
      return [...cell.children].some((child) => {
        const text = child.getBoundingClientRect();
        return text.left < rect.left || text.right > rect.right || text.top < rect.top || text.bottom > rect.bottom;
      });
    }).map((cell) => cell.textContent));
    expect(textOverflows).toEqual([]);
    await page.getByRole("navigation").getByRole("link", { name: "历史趋势" }).click();
    for (const label of ["近3年", "全部"]) {
      await heatmap.getByRole("group", { name: "热力图时间范围" }).getByRole("button", { name: label, exact: true }).click();
      await expect(heatmap.locator("svg text").filter({ hasText: /^2026-08$/ })).toHaveCount(2);
      const overlaps = await heatmap.locator("svg text").evaluateAll((texts) => {
        const dates = texts.filter((text) => /^\d{4}-\d{2}$/.test(text.textContent ?? "")).map((text) => text.getBoundingClientRect());
        return dates.some((rect, index) => dates.slice(index + 1).some((other) =>
          Math.min(rect.right, other.right) > Math.max(rect.left, other.left)
          && Math.min(rect.bottom, other.bottom) > Math.max(rect.top, other.top)));
      });
      expect(overlaps).toBe(false);
    }
  }
});
