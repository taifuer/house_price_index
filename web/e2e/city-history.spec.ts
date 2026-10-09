import { expect, test } from "@playwright/test";
import { formatPct } from "../src/lib/format";
import type { DatasetShard, Manifest } from "../src/types";

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => { throw error; });
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("[ECharts]")) throw new Error(message.text());
  });
});

test("historical rows match published metrics, paginate fully and retain missing observations", async ({ page }) => {
  await page.goto("/?section=cities&city=北京&cityPeriod=2026-08&indexStart=2021-08&indexEnd=2026-08");
  const table = page.locator(".city-history-table");
  await expect(table).toHaveAttribute("aria-busy", "false");
  await expect(table.getByRole("columnheader")).toHaveText(["月份", "环比", "同比", "累计平均同比"]);
  await expect(table.locator("tbody tr")).toHaveCount(12);
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const cityIndex = manifest.cities.findIndex((city) => city.name === "北京");
  for (const [index, metric] of manifest.dimensions.metrics.entries()) {
    const descriptor = manifest.datasets.find((dataset) => dataset.houseType === "二手住宅" && dataset.sizeBand === "全部" && dataset.metric === metric)!;
    const shard = await (await page.request.get(`/data/${descriptor.path}`)).json() as DatasetShard;
    for (const month of ["2026-08", "2026-01"]) {
      const value = shard.values[shard.periods.indexOf(month)]?.[cityIndex];
      await expect(table.locator(`tr[data-period="${month}"] td`).nth(index)).toHaveText(value == null ? "—" : formatPct(value - 100));
    }
  }
  await table.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(table.locator("tbody tr").first()).toHaveAttribute("data-period", "2025-08");
  await page.getByRole("group", { name: "城市历史时间范围" }).getByRole("button", { name: "全部", exact: true }).click();
  const first = manifest.datasets.find((dataset) => dataset.id === "resale-all-mom")!.periods[0]!;
  const seen = new Set<string>();
  for (let index = 0; index < 30; index++) {
    for (const month of await table.locator("tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-period")!))) seen.add(month);
    const next = table.getByRole("button", { name: "下一页", exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  }
  expect(seen.has(first)).toBe(true);
  expect(seen.has("2026-08")).toBe(true);
  await expect(table.getByRole("button", { name: "下一页", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /CSV/ })).toHaveCount(0);
});

test("shared controls update both charts and historical rows without changing national filters", async ({ page }) => {
  await page.goto("/?section=cities&city=杭州&view=resale-all-yoy&period=2026-07");
  const controls = page.getByRole("group", { name: "城市历史筛选", exact: true });
  await controls.getByRole("combobox", { name: "城市历史住宅类型" }).selectOption("新建商品住宅");
  await controls.getByLabel("起始月份").selectOption("2025-12");
  await controls.getByLabel("结束月份").selectOption("2026-07");
  await expect(page.locator(".city-history-table table")).toHaveAttribute("aria-label", "杭州新建商品住宅历史明细");
  await expect(page.locator(".city-history-table tbody tr")).toHaveCount(8);
  for (const chart of await page.locator(".city-data-page .chart-canvas").all()) {
    await expect(chart).toHaveAttribute("data-period-start", "2025-12");
    await expect(chart).toHaveAttribute("data-period-end", "2026-07");
  }
  const before = await page.getByTestId("interval-end-index").innerText();
  await page.getByRole("combobox", { name: "走势指标" }).selectOption("累计平均");
  await expect(page.getByTestId("interval-end-index")).toHaveText(before);
  await expect(page.locator(".city-history-table thead th")).toHaveCount(4);
  await page.reload();
  await expect(controls.getByLabel("结束月份")).toHaveValue("2026-07");
  await expect(controls.getByRole("combobox", { name: "城市历史住宅类型" })).toHaveValue("新建商品住宅");
  await page.getByRole("navigation").getByRole("link", { name: "月度概览" }).click();
  await expect(page.locator(".section-title-meta")).toHaveText("二手住宅 · 同比 · 2026年7月");
});

test("chart click or tap and table selection inspect one month without rebasing or jumping", async ({ page }, testInfo) => {
  await page.goto("/?section=cities&city=北京&indexStart=2025-12&indexEnd=2026-08");
  const chart = page.locator(".interval-index-chart .chart-canvas");
  await expect(chart.locator("svg")).toBeVisible();
  const endpoint = await page.getByTestId("interval-end-index").innerText();
  await chart.scrollIntoViewIfNeeded();
  const beforeScroll = await page.evaluate(() => scrollY);
  const box = (await chart.boundingBox())!;
  const left = testInfo.project.name === "mobile" ? 42 : 54;
  const x = box.x + left + (box.width - left - 20) / 2;
  const y = box.y + box.height / 2;
  if (testInfo.project.name === "mobile") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-04");
  await expect(page.locator('.city-history-table tr[data-period="2026-04"]')).toHaveClass("is-selected");
  await expect(page.locator(".city-trend-chart .chart-canvas")).toHaveAttribute("data-selected-period", "2026-04");
  expect(Math.abs(await page.evaluate(() => scrollY) - beforeScroll)).toBeLessThanOrEqual(2);
  const tableButton = page.getByRole("button", { name: "查看2026-01当月表现" });
  await tableButton.click();
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-01");
  await expect(chart).toHaveAttribute("data-selected-period", "2026-01");
  await expect(page.getByTestId("interval-end-index")).toHaveText(endpoint);
  await expect(page.getByLabel("起始月份", { exact: true })).toHaveValue("2025-12");
  await expect(page.getByLabel("结束月份", { exact: true })).toHaveValue("2026-08");
});

test("history distinguishes failed and missing data from flat-filled interval estimates", async ({ page }) => {
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const descriptor = manifest.datasets.find((dataset) => dataset.id === "resale-all-mom")!;
  const shard = await (await page.request.get(`/data/${descriptor.path}`)).json() as DatasetShard;
  shard.values[shard.periods.indexOf("2026-04")]![manifest.cities.findIndex((city) => city.name === "北京")] = null;
  await page.route("**/data/shards/resale-all-mom.json", (route) => route.fulfill({ json: shard }));
  await page.route("**/data/shards/resale-all-yoy.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/?section=cities&cityPeriod=2026-08&indexStart=2025-12&indexEnd=2026-08");
  const row = page.locator('.city-history-table tr[data-period="2026-04"]');
  await expect(row.getByRole("cell").nth(0)).toHaveText("—");
  await expect(row.getByRole("cell").nth(1)).toHaveText("加载失败");
  await expect(page.locator(".interval-fill-note")).toContainText("2026年4月");
  await expect(page.getByTestId("interval-end-index")).not.toHaveText("--");
});

test("bottom navigation reserves space for footer and scroll jump and yields to overlays", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation only");
  await page.goto("/?section=cities");
  await expect(page.locator(".city-history-table")).toHaveAttribute("aria-busy", "false");
  const nav = page.getByRole("navigation", { name: "数据视图" });
  const footer = page.locator(".app-footer");
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await expect(page.getByRole("button", { name: "回到顶部" })).toBeVisible();
  const footerBox = (await footer.boundingBox())!;
  const navBox = (await nav.boundingBox())!;
  const jumpBox = (await page.getByRole("button", { name: "回到顶部" }).boundingBox())!;
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(navBox.y + 1);
  expect(jumpBox.y + jumpBox.height).toBeLessThan(footerBox.y);
  await page.locator(".filter-toggle").click();
  await expect(page.locator(".task-navigation")).toBeHidden();
  await expect(page.getByRole("dialog", { name: "城市看板筛选" })).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(nav).toBeVisible();
  await page.locator(".search-toggle").click();
  await expect(page.locator(".task-navigation")).toBeHidden();
  await page.getByRole("dialog", { name: "搜索城市" }).getByRole("searchbox").fill("杭州");
  await page.keyboard.press("Escape");
  await expect(nav).toBeVisible();
});

test("switching destinations restores scroll positions after lazy chart loading", async ({ page }) => {
  await page.goto("/?section=history");
  const nav = page.getByRole("navigation");
  await expect(page.locator(".heatmap-chart .chart-canvas svg")).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 950, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(950);
  await nav.getByRole("link", { name: "城市看板" }).click();
  await expect(page.locator(".city-history-table")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(600);
  await nav.getByRole("link", { name: "历史趋势" }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(950);
  await nav.getByRole("link", { name: "城市看板" }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(600);
});

test("hover links monthly tooltips without persisting selection and leaves no stuck emphasis", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop hover only");
  await page.goto("/?section=cities&indexStart=2025-12&indexEnd=2026-08");
  const trend = page.locator(".city-trend-chart .chart-canvas");
  const interval = page.locator(".interval-index-chart .chart-canvas");
  await expect(interval.locator("svg")).toBeVisible();
  await trend.scrollIntoViewIfNeeded();
  const box = (await trend.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const tooltip = interval.locator("div").filter({ hasText: "相对起点" }).last();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("2026年4月");
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-08");
  await page.mouse.move(box.x - 4, box.y);
  await expect(tooltip).toBeHidden();
});

test("touch scrolling over a chart does not select a month", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile gestures only");
  await page.goto("/?section=cities");
  const chart = page.locator(".city-trend-chart .chart-canvas");
  await expect(chart.locator("svg")).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (const offset of [20, 45, 70, 100]) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - offset }] });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByRole("combobox", { name: "当月表现月份" })).toHaveValue("2026-08");
  await expect(chart).toHaveAttribute("data-selected-period", "2026-08");
  await session.detach();
});
