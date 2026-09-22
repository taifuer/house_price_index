import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { DatasetShard, Manifest } from "../src/types";

async function localShard(id: string): Promise<DatasetShard> {
  return JSON.parse(await readFile(`public/data/shards/${id}.json`, "utf8")) as DatasetShard;
}

async function defaultBounds() {
  const end = (await localShard("resale-all-mom")).periods.at(-1)!;
  return { start: `${Number(end.slice(0, 4)) - 5}${end.slice(4)}`, end };
}

async function expectedIndex(city: string, start: string, end: string, id = "resale-all-mom") {
  const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8")) as Manifest;
  const shard = await localShard(id);
  const cityIndex = manifest.cities.findIndex((item) => item.name === city);
  return shard.periods.reduce((value, period, index) => period > start && period <= end
    ? value * shard.values[index]![cityIndex]! / 100 : value, 100);
}

test("defaults to a five-year rebased MoM index without another data request", async ({ page }, testInfo) => {
  const { start, end } = await defaultBounds();
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/shards/resale-all-mom.json")) requests.push(request.url()); });
  await page.goto("/?view=resale-all-mom&period=2026-08");
  const view = page.locator(".interval-index-chart");
  await expect(view.getByRole("heading", { name: "区间指数" })).toBeVisible();
  await expect(view.getByRole("combobox", { name: "城市", exact: true })).toHaveValue("北京");
  await expect(view.getByLabel("起始月份")).toHaveValue(start);
  await expect(view.getByLabel("结束月份")).toHaveValue(end);
  await expect(view.getByRole("checkbox")).toHaveCount(0);
  await expect(view.locator(".interval-fill-note")).toHaveCount(0);
  expect(await view.locator("optgroup").evaluateAll((groups) => groups.map((group) => group.getAttribute("label"))))
    .toEqual(["一线", "二线", "三线"]);
  const endpoint = await expectedIndex("北京", start, end);
  await expect(view.getByTestId("interval-end-index")).toHaveText(endpoint.toFixed(1));
  await expect(view.getByTestId("interval-change")).toHaveText(`${endpoint - 100 > 0 ? "+" : ""}${(endpoint - 100).toFixed(1)}%`);
  await expect(view.locator(".chart-canvas svg")).toBeVisible();
  await expect(view.locator(".interval-meta")).toContainText("环比连乘 · 起点 = 100");
  await expect(view.locator(".interval-method")).toContainText("非官方定基指数");
  expect(requests).toHaveLength(1);
  if (testInfo.project.name === "mobile") await expect(view.locator(".chart-actions")).toHaveCount(0);
  await view.scrollIntoViewIfNeeded();
  await view.screenshot({ path: `/tmp/house-interval-default-${testInfo.project.name}.png`, scale: "css" });
});

test("shows dashed crosshairs on hover or tap without adding overlapping axis labels", async ({ page }, testInfo) => {
  await page.goto("/?view=resale-all-mom&period=2026-08");
  const view = page.locator(".interval-index-chart");
  const chart = view.locator(".chart-canvas");
  await expect(chart.locator("svg")).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  const bounds = (await chart.boundingBox())!;
  const mobile = testInfo.project.name === "mobile";
  const left = mobile ? 42 : 54;
  const guides = chart.locator('path[stroke="#98a2b3"][stroke-dasharray]');
  const labelCount = await chart.locator("svg text").count();
  for (const ratio of [0.35, 0.65]) {
    const x = bounds.x + left + (bounds.width - left - 20) * ratio;
    const y = bounds.y + 32 + (bounds.height - 32 - 40) * ratio;
    if (mobile) await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
    await expect(chart.locator("div").filter({ hasText: "相对起点" }).last()).toBeVisible();
    await expect(guides).toHaveCount(2);
    const lines = await guides.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, y: rect.y };
    }));
    const horizontal = lines.find((line) => line.width > 180 && line.height <= 1);
    expect(horizontal).toBeDefined();
    expect(Math.abs(horizontal!.y - y)).toBeLessThanOrEqual(1);
    expect(lines.some((line) => line.height > 200 && line.width <= 1)).toBe(true);
    await expect(chart.locator("svg text")).toHaveCount(labelCount);
  }
  await view.screenshot({ path: `/tmp/house-interval-crosshair-${testInfo.project.name}.png`, scale: "css" });
  if (!mobile) {
    await page.mouse.move(bounds.x - 4, bounds.y);
    await expect(guides).toHaveCount(0);
  }
});

test("preserves city and dates across global metrics, housing filters, collapse and reload", async ({ page }) => {
  await page.goto("/?view=resale-all-mom&period=2026-08&indexStart=2021-08&indexEnd=2026-08&indexFill=flat");
  const view = page.locator(".interval-index-chart");
  await expect(view.getByRole("checkbox")).toHaveCount(0);
  await expect(page).not.toHaveURL(/indexFill=/);
  await view.getByRole("combobox", { name: "城市", exact: true }).selectOption("广州");
  await view.getByLabel("结束月份").selectOption("2025-08");
  const endpoint = await expectedIndex("广州", "2021-08", "2025-08");
  await expect(view.getByTestId("interval-end-index")).toHaveText(endpoint.toFixed(1));
  await expect(page).toHaveURL(/indexCity=/);
  await expect(page).toHaveURL(/indexStart=2021-08/);
  await expect(page).toHaveURL(/indexEnd=2025-08/);
  await page.reload();
  await expect(view.getByRole("checkbox")).toHaveCount(0);
  await expect(view.locator(".interval-estimate-marker")).toHaveCount(0);
  await expect(view.getByLabel("起始月份")).toHaveValue("2021-08");
  await expect(view.getByLabel("结束月份")).toHaveValue("2025-08");
  await expect(view.getByRole("combobox", { name: "城市", exact: true })).toHaveValue("广州");
  for (const metric of ["同比", "累计平均同比"]) {
    await page.locator(".filter-toggle").click();
    await page.locator(".filter-list").getByRole("combobox", { name: "指标", exact: true }).selectOption({ label: metric });
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await expect(view.getByTestId("interval-end-index")).toHaveText(endpoint.toFixed(1));
    await expect(view.locator(".interval-meta")).toContainText("环比连乘");
    await expect(view.getByRole("checkbox")).toHaveCount(0);
  }
  await page.locator(".filter-toggle").click();
  await page.locator(".filter-list").getByRole("combobox", { name: "住宅类型", exact: true }).selectOption({ label: "新建商品住宅" });
  await page.locator(".filter-list").getByRole("combobox", { name: "面积段", exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(view.locator(".interval-meta")).toContainText("新建商品住宅");
  await expect(view.locator(".interval-meta")).toContainText("90m²及以下");
  await expect(view.getByTestId("interval-end-index")).toHaveText((await expectedIndex("广州", "2021-08", "2025-08", "new-under-90-mom")).toFixed(1));
  const trends = page.locator(".collapsible-section").nth(1);
  await trends.locator(".section-toggle").click();
  await expect(view).toHaveCount(0);
  await trends.locator(".section-toggle").click();
  await expect(view.getByRole("combobox", { name: "城市", exact: true })).toHaveValue("广州");
  await expect(view.getByLabel("结束月份")).toHaveValue("2025-08");
  await expect(view.getByRole("checkbox")).toHaveCount(0);
});

test("automatically fills gaps and lists every missing range with no mode control", async ({ page }, testInfo) => {
  const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8")) as Manifest;
  const shard = await localShard("resale-all-mom");
  const cityIndex = manifest.cities.findIndex((city) => city.name === "北京");
  for (const period of ["2026-01", "2026-02", "2026-04", "2026-06", "2026-08"]) {
    shard.values[shard.periods.indexOf(period)]![cityIndex] = null;
  }
  const endpoint = shard.periods.reduce((value, period, index) => period > "2025-12" && period <= "2026-08"
    ? value * (shard.values[index]![cityIndex] ?? 100) / 100 : value, 100);
  await page.route("**/data/shards/resale-all-mom.json", (route) => route.fulfill({ json: shard }));
  await page.goto("/?view=resale-all-mom&period=2026-08&indexStart=2025-12&indexEnd=2026-08");
  const view = page.locator(".interval-index-chart");
  await expect(view.getByRole("checkbox")).toHaveCount(0);
  await expect(page).not.toHaveURL(/indexFill=/);
  await expect(view.getByTestId("interval-end-index")).toHaveText(endpoint.toFixed(1));
  await expect(view.getByTestId("interval-change")).toHaveText(`${endpoint - 100 > 0 ? "+" : ""}${(endpoint - 100).toFixed(1)}%`);
  await expect(view.locator(".interval-estimate-marker")).toHaveText(["*", "*"]);
  await expect(view.locator(".interval-summary dt")).toHaveText(["终点指数*", "区间累计涨跌*"]);
  await expect(view.locator(".interval-summary")).toHaveAttribute("aria-describedby", "interval-fill-note");
  await expect(view.locator(".interval-fill-note")).toHaveText(/^\* 缺失 5 个月环比数据：/);
  await expect(view.locator(".interval-fill-note")).toContainText("2026年1月 至 2026年2月、2026年4月、2026年6月、2026年8月");
  await expect(view.locator(".interval-fill-note")).not.toContainText(" 等");
  await expect(view.locator(".interval-fill-note")).toContainText("已按持平填补");
  await expect(view.locator(".interval-fill-note")).toContainText("后续累计值均含填补假设");
  const chart = view.locator(".chart-canvas");
  await expect(chart).toHaveAttribute("aria-label", /持平填补/);
  await expect(chart.locator('path[stroke="#2563eb"][stroke-dasharray]')).toHaveCount(4);
  await expect(chart.locator("svg text").filter({ hasText: "含持平填补：5个月" })).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  const bounds = (await chart.boundingBox())!;
  const left = testInfo.project.name === "mobile" ? 42 : 54;
  for (const [offset, monthly, estimated] of [
    [1, "当月环比缺失，按持平填补", true],
    [7, "当月环比", true],
    [0, "基准月", false],
  ] as const) {
    const x = bounds.x + left + (bounds.width - left - 20) * offset / 8 + (offset === 0 ? 1 : 0);
    const y = bounds.y + bounds.height / 2;
    if (testInfo.project.name === "mobile") await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
    const tooltip = chart.locator("div").filter({ hasText: "相对起点" }).last();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(monthly);
    if (estimated) await expect(tooltip).toContainText("含持平填补");
    else await expect(tooltip).not.toContainText("含持平填补");
  }
  if (testInfo.project.name === "desktop") {
    const downloadPromise = page.waitForEvent("download");
    await view.getByRole("button", { name: "下载图表", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toContain("区间指数（含持平填补）.png");
  }
  await page.reload();
  await expect(view.getByRole("checkbox")).toHaveCount(0);
  await expect(view.getByTestId("interval-end-index")).toHaveText(endpoint.toFixed(1));
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 900 });
  await view.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  for (const title of await view.locator(".interval-summary dt").all()) {
    expect((await title.boundingBox())!.height).toBe(20);
  }
  await view.screenshot({ path: `/tmp/house-interval-imputed-${testInfo.project.name}.png`, scale: "css" });
  await view.getByLabel("起始月份").selectOption("2026-08");
  await expect(view.getByTestId("interval-end-index")).toHaveText("100.0");
  await expect(view.locator(".interval-estimate-marker")).toHaveCount(0);
  await expect(view.locator(".interval-fill-note")).toHaveCount(0);
});

test("fills absent calendar months and ignores obsolete strict-mode links", async ({ page }) => {
  const shard = await localShard("resale-all-mom");
  const missingIndex = shard.periods.indexOf("2022-03");
  shard.periods.splice(missingIndex, 1);
  shard.values.splice(missingIndex, 1);
  shard.sources.splice(missingIndex, 1);
  await page.route("**/data/shards/resale-all-mom.json", (route) => route.fulfill({ json: shard }));
  await page.goto("/?view=resale-all-mom&period=2026-08&indexStart=2021-08&indexEnd=2026-08&indexFill=strict");
  const view = page.locator(".interval-index-chart");
  await expect(view.getByRole("checkbox")).toHaveCount(0);
  await expect(page).not.toHaveURL(/indexFill=/);
  const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8")) as Manifest;
  const cityIndex = manifest.cities.findIndex((city) => city.name === "北京");
  const endpoint = shard.periods.reduce((value, period, index) => period > "2021-08" && period <= "2026-08"
    ? value * shard.values[index]![cityIndex]! / 100 : value, 100);
  await expect(view.getByTestId("interval-end-index")).toHaveText(endpoint.toFixed(1));
  await expect(view.getByRole("status")).toContainText("缺失 1 个月环比数据：2022年3月");
  await expect(view.locator(".chart-canvas svg")).toBeVisible();
  await view.getByLabel("起始月份").selectOption("2022-03");
  await expect(view.locator(".chart-canvas svg")).toBeVisible();
  await expect(view.getByTestId("interval-end-index")).toHaveText((await expectedIndex("北京", "2022-03", "2026-08")).toFixed(1));
  await expect(view.locator(".interval-fill-note")).toHaveCount(0);
  await expect(view.locator(".interval-estimate-marker")).toHaveCount(0);
});

test("shows a load failure instead of using the selected YoY data", async ({ page }) => {
  await page.route("**/data/shards/resale-all-mom.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("/?view=resale-all-yoy&period=2026-08");
  const view = page.locator(".interval-index-chart");
  await expect(view.getByRole("alert")).toContainText("503");
  await expect(view.getByTestId("interval-end-index")).toHaveText("--");
  await expect(view.locator(".chart-canvas")).toHaveCount(0);
});

test("handles short intervals, same-month bounds and invalid shared selections", async ({ page }) => {
  const { start, end } = await defaultBounds();
  await page.goto("/?view=resale-all-mom&period=2026-08&indexCity=invalid&indexStart=2026-13&indexEnd=9999-01&indexFill=invalid");
  const view = page.locator(".interval-index-chart");
  await expect(view.getByRole("combobox", { name: "城市", exact: true })).toHaveValue("北京");
  await expect(view.getByLabel("起始月份")).toHaveValue(start);
  await expect(view.getByLabel("结束月份")).toHaveValue(end);
  await expect(view.getByRole("checkbox")).toHaveCount(0);
  await expect(page).not.toHaveURL(/indexFill=/);
  await view.getByLabel("起始月份").selectOption("2026-07");
  await view.getByLabel("结束月份").selectOption("2026-08");
  await expect(view.getByTestId("interval-end-index")).toHaveText((await expectedIndex("北京", "2026-07", "2026-08")).toFixed(1));
  await expect(view.getByLabel("结束月份").locator('option[value="2026-06"]')).toHaveJSProperty("disabled", true);
  await view.getByLabel("起始月份").selectOption("2026-08");
  await expect(view.getByTestId("interval-end-index")).toHaveText("100.0");
  await expect(view.getByTestId("interval-change")).toHaveText("0.0%");
  await expect(view.locator(".chart-canvas svg")).toBeVisible();
});

test("keeps controls, endpoint labels and chart within desktop and mobile widths", async ({ page }, testInfo) => {
  await page.goto("/?view=resale-all-mom&period=2026-08&indexCity=乌鲁木齐&indexStart=2021-08&indexEnd=2026-08");
  const view = page.locator(".interval-index-chart");
  for (const width of testInfo.project.name === "mobile" ? [320, 360, 390, 430] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(view.locator(".chart-canvas svg")).toBeVisible();
    await view.scrollIntoViewIfNeeded();
    const mobile = width < 768;
    const text = view.locator(".chart-canvas svg text");
    await expect(text.filter({ hasText: mobile ? /^21年8月$/ : /^2021年8月$/ })).toBeVisible();
    await expect(text.filter({ hasText: mobile ? /^26年8月$/ : /^2026年8月$/ })).toBeVisible();
    const labels = await text.filter({ hasText: /^\d{2,4}年\d{1,2}月$/ }).evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
    for (let index = 0; index < labels.length; index++) {
      for (const next of labels.slice(index + 1)) {
        const current = labels[index]!;
        expect(current.right <= next.left || next.right <= current.left || current.bottom <= next.top || next.bottom <= current.top).toBe(true);
      }
    }
    for (const select of await view.getByRole("combobox").all()) {
      const box = (await select.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await view.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await view.screenshot({ path: `/tmp/house-interval-${width}.png`, scale: "css" });
  }
});
