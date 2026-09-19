import { expect, test } from "@playwright/test";
import type { DatasetShard, Manifest } from "../src/types";

test.beforeEach(async ({ page }) => {
  await page.goto("/?view=resale-all-mom&period=2026-08");
  await expect(page.locator(".ranking-chart .chart-canvas svg")).toBeVisible();
});

test("monthly data shows all cities without search, pagination or download and supports sorting", async ({ page }, testInfo) => {
  await expect(page).toHaveTitle("全国 70 城房价指数");
  await expect(page.locator(".app-title")).toHaveText("全国 70 城房价指数");
  const ranking = page.locator(".ranking-chart");
  for (const toggle of [ranking.locator(".data-view-toggle"), page.locator(".city-trend-chart .data-view-toggle")]) {
    await expect(toggle.getByRole("button")).toHaveText(["图", "表"]);
    await expect(toggle.getByRole("button", { name: "统计图", exact: true })).toHaveAttribute("title", "统计图");
    await expect(toggle.getByRole("button", { name: "数据表", exact: true })).toHaveAttribute("title", "数据表");
    const dimensions = await toggle.getByRole("button").evaluateAll((buttons) => buttons.map((button) => {
      const { width, height } = button.getBoundingClientRect();
      const filter = button.closest(".chart-block")!.querySelector(".data-chart-filter .segmented button")!;
      const properties = ["height", "min-width", "font-size", "font-family", "font-weight", "line-height", "padding", "display", "align-items", "justify-content"];
      const style = getComputedStyle(button);
      const filterStyle = getComputedStyle(filter);
      return {
        width, height,
        style: properties.map((property) => style.getPropertyValue(property)),
        filterStyle: properties.map((property) => filterStyle.getPropertyValue(property)),
        overflows: button.scrollWidth > button.clientWidth,
      };
    }));
    for (const button of dimensions) {
      expect(button.style).toEqual(button.filterStyle);
      expect(button.width).toBeLessThan(testInfo.project.name === "mobile" ? 56 : 64);
      expect(button.height).toBe(testInfo.project.name === "mobile" ? 32 : 34);
      expect(button.overflows).toBe(false);
    }
  }
  await ranking.getByRole("button", { name: "数据表", exact: true }).click();
  const table = ranking.getByRole("table", { name: "当月城市数据", exact: true });
  await expect(table.locator("tbody tr")).toHaveCount(70);
  await expect(ranking.getByRole("searchbox")).toHaveCount(0);
  await expect(ranking.getByRole("combobox")).toHaveCount(0);
  await expect(ranking.getByRole("button", { name: /下载/ })).toHaveCount(0);
  await expect(ranking.locator(".data-table-pagination")).toHaveCount(0);
  await expect(ranking.getByRole("status")).toHaveText("共 70 条");
  const scroll = ranking.locator(".data-table-scroll");
  await scroll.scrollIntoViewIfNeeded();
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(table.locator("tbody tr").last()).toBeInViewport();
  await expect(table.getByRole("columnheader", { name: "涨跌幅" })).toHaveAttribute("aria-sort", "descending");
  await table.getByRole("button", { name: "涨跌幅", exact: true }).click();
  await expect(table.getByRole("columnheader", { name: "涨跌幅" })).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  const changes = await table.locator("tbody tr td.change-down, tbody tr td.change-up, tbody tr td.change-flat").allTextContents();
  const numbers = changes.map((value) => parseFloat(value));
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

  await ranking.getByRole("button", { name: "一线", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(4);
  expect(await scroll.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  const beijing = table.locator("tbody tr").filter({ has: page.getByRole("button", { name: "查看北京走势", exact: true }) });
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const descriptor = manifest.datasets.find((dataset) => dataset.id === "resale-all-mom")!;
  const shard = await (await page.request.get(`/data/${descriptor.path}`)).json() as DatasetShard;
  const cityIndex = manifest.cities.findIndex((city) => city.name === "北京");
  const value = shard.values[shard.periods.indexOf("2026-08")]![cityIndex]!;
  await expect(beijing.locator("td.numeric").first()).toHaveText(value.toFixed(1));
  await expect(beijing.locator("a")).toHaveAttribute("href", shard.sources[shard.periods.indexOf("2026-08")]!.url);
  await ranking.getByRole("button", { name: "全部", exact: true }).click();
  await ranking.evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 70, behavior: "instant" }));
  await page.screenshot({ path: `/tmp/house-data-ranking-${testInfo.project.name}.png` });
  await ranking.getByRole("button", { name: "统计图", exact: true }).click();
  await expect(ranking.locator(".chart-canvas svg")).toBeVisible();
});

test("monthly table preserves data mode when housing type and month change", async ({ page }) => {
  const ranking = page.locator(".ranking-chart");
  await ranking.getByRole("button", { name: "数据表", exact: true }).click();
  await page.locator(".filter-toggle").click();
  await page.locator(".filter-list label").nth(1).locator("select").selectOption({ label: "新建商品住宅" });
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(ranking.getByRole("table")).toBeVisible();
  await expect(ranking.locator(".data-table-scope")).toContainText("新建商品住宅");
  const beijing = ranking.locator("tbody tr").filter({ has: page.getByRole("button", { name: "查看北京走势", exact: true }) });
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const descriptor = manifest.datasets.find((dataset) => dataset.id === "new-all-mom")!;
  const shard = await (await page.request.get(`/data/${descriptor.path}`)).json() as DatasetShard;
  const cityIndex = manifest.cities.findIndex((city) => city.name === "北京");
  await expect(beijing.locator("td.numeric").first()).toHaveText(shard.values[shard.periods.indexOf("2026-08")]![cityIndex]!.toFixed(1));
  await page.locator(".filter-toggle").click();
  await page.locator(".filter-list label").nth(0).locator("select").selectOption("2026-07");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(ranking.locator(".data-table-scope")).toContainText("2026-07");
  await expect(beijing.locator("td.numeric").first()).toHaveText(shard.values[shard.periods.indexOf("2026-07")]![cityIndex]!.toFixed(1));
});

test("city link opens collapsed trends, selects one city and exposes its history", async ({ page }, testInfo) => {
  const trendSection = page.locator(".collapsible-section").nth(1);
  await trendSection.locator(".section-toggle").click();
  const ranking = page.locator(".ranking-chart");
  await ranking.getByRole("button", { name: "数据表", exact: true }).click();
  await ranking.getByRole("button", { name: "查看北京走势" }).click();
  await expect(trendSection.locator(".section-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".city-trend-anchor")).toBeFocused();
  const city = page.locator(".city-trend-chart");
  await expect(city.locator(".city-tag")).toHaveText(["北京"]);
  await expect(city.locator(".chart-canvas svg")).toBeVisible();
  await expect(page).toHaveURL(/cities=%E5%8C%97%E4%BA%AC/);
  await city.getByRole("button", { name: "数据表", exact: true }).click();
  await expect(city.getByRole("status")).toHaveText("共 60 条");
  const table = city.getByRole("table", { name: "城市历史数据", exact: true });
  await expect(table.locator("tbody tr")).toHaveCount(60);
  await expect(table.locator("tbody th").first()).toHaveText("2026-08");
  await expect(table.locator("tbody tr").first().locator("td").first()).toHaveText("北京");
  await city.getByRole("button", { name: "近3年", exact: true }).click();
  await expect(city.getByRole("status")).toHaveText("共 36 条");
  await expect(table.locator("tbody tr")).toHaveCount(36);
  await expect(table.locator("tbody tr").last()).toContainText("2023-09");
  await expect(city.getByRole("button", { name: /下载/ })).toHaveCount(0);

  await city.getByRole("button", { name: "选择城市" }).click();
  await city.getByPlaceholder("搜索城市").fill("上海");
  await city.getByRole("button", { name: "上海", exact: true }).click();
  await city.getByRole("button", { name: "选择城市" }).click();
  await expect(city.getByRole("status")).toHaveText("共 72 条");
  await city.evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 70, behavior: "instant" }));
  await page.screenshot({ path: `/tmp/house-data-history-${testInfo.project.name}.png` });
  await city.getByRole("button", { name: "移除北京" }).click();
  await city.getByRole("button", { name: "移除上海" }).click();
  await expect(city.locator(".empty-chart")).toBeVisible();
  await expect(city.locator("table")).toHaveCount(0);
});

test("tables follow the dataset and keep missing months as blank observations", async ({ page }) => {
  await page.goto("/?view=resale-all-average&period=2026-08&cities=北京&cityRange=3y");
  const city = page.locator(".city-trend-chart");
  await city.getByRole("button", { name: "数据表", exact: true }).click();
  const table = city.getByRole("table", { name: "城市历史数据", exact: true });
  await expect(table.getByRole("columnheader", { name: "累计平均同比指数" })).toBeVisible();
  const january = table.locator("tbody tr").filter({ hasText: "2026-01" });
  await expect(january.locator("td.numeric")).toHaveText(["—", "—"]);
  await expect(january.locator("a")).toHaveCount(0);
  await expect(city.locator(".trend-note")).toContainText("数据缺失");

  await page.locator(".filter-toggle").click();
  await page.locator(".filter-list label").nth(3).locator("select").selectOption({ label: "同比" });
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(table.getByRole("columnheader", { name: "同比指数", exact: true })).toBeVisible();
  await expect(table.locator("tbody tr").filter({ hasText: "2026-01" }).locator("td.numeric")).not.toHaveText(["—", "—"]);
});

test("tables scroll both ways with sticky headers and first columns without page overflow", async ({ page }, testInfo) => {
  const widths = testInfo.project.name === "mobile" ? [320, 390, 768] : [1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    for (const selector of [".ranking-chart", ".city-trend-chart"]) {
      const chart = page.locator(selector);
      await chart.getByRole("button", { name: "数据表", exact: true }).click();
      const scroll = chart.locator(".data-table-scroll");
      await scroll.scrollIntoViewIfNeeded();
      const firstCell = scroll.locator("tbody tr").first().locator("th");
      const before = await firstCell.boundingBox();
      const corner = scroll.locator("thead th").first();
      const headerBefore = await corner.boundingBox();
      const pageY = await page.evaluate(() => scrollY);
      expect((await scroll.boundingBox())!.height).toBeLessThanOrEqual(520);
      await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; element.scrollTop = element.scrollHeight; });
      const after = await firstCell.boundingBox();
      const headerAfter = await corner.boundingBox();
      expect(Math.abs(before!.x - after!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(headerBefore!.x - headerAfter!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(headerBefore!.y - headerAfter!.y)).toBeLessThanOrEqual(1);
      expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => scrollY)).toBe(pageY);
      await expect(scroll.locator("tbody tr").last()).toBeInViewport();
      if (width < 768) expect(await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const controls = await chart.locator(".data-chart-heading > *").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (let i = 0; i < controls.length; i++) {
        for (const next of controls.slice(i + 1)) {
          const current = controls[i]!;
          expect(Math.min(current.right, next.right) <= Math.max(current.left, next.left)
            || Math.min(current.bottom, next.bottom) <= Math.max(current.top, next.top)).toBe(true);
        }
      }
      if (width === 390 || width === 1440) {
        await chart.evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 70, behavior: "instant" }));
        await page.screenshot({ path: `/tmp/house-scroll-${selector.slice(1)}-${width}.png` });
      }
      await chart.getByRole("button", { name: "统计图", exact: true }).click();
    }
  }
});

test("full-width tables balance every column and keep long labels readable", async ({ page }, testInfo) => {
  await page.goto("/?view=resale-all-average&period=2026-08&cities=乌鲁木齐&cityRange=3y");
  const widths = testInfo.project.name === "mobile" ? [320, 390, 768] : [1024, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    for (const selector of [".ranking-chart", ".city-trend-chart"]) {
      const chart = page.locator(selector);
      await chart.getByRole("button", { name: "数据表", exact: true }).click();
      const scroll = chart.locator(".data-table-scroll");
      await expect(scroll.getByRole("columnheader", { name: "累计平均同比指数" })).toBeVisible();
      const layout = await scroll.evaluate((element) => {
        const cells = [...element.querySelectorAll<HTMLTableCellElement>("th, td")];
        const overflowingCells = cells.filter((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const content = range.getBoundingClientRect();
          const bounds = cell.getBoundingClientRect();
          return content.left < bounds.left - 1 || content.right > bounds.right + 1
            || content.top < bounds.top - 1 || content.bottom > bounds.bottom + 1;
        }).map((cell) => cell.textContent);
        const row = element.querySelector("tbody tr")!;
        const tableWidth = element.querySelector("table")!.getBoundingClientRect().width;
        return {
          overflowingCells,
          width: element.getBoundingClientRect().width,
          columnShares: [...element.querySelectorAll("col")].map((column) => column.getBoundingClientRect().width / tableWidth),
          horizontalOverflow: element.scrollWidth - element.clientWidth,
          visibleRight: element.getBoundingClientRect().left + element.clientWidth,
          thirdColumnRight: row.children[2]!.getBoundingClientRect().right,
          fourthColumnRight: row.children[3]!.getBoundingClientRect().right,
        };
      });
      expect(layout.overflowingCells).toEqual([]);
      expect(Math.abs(layout.width - (await chart.boundingBox())!.width)).toBeLessThanOrEqual(1);
      if (width >= 768) {
        for (const share of layout.columnShares) {
          expect(share).toBeGreaterThanOrEqual(0.15);
          expect(share).toBeLessThanOrEqual(0.25);
        }
      }
      expect(layout.thirdColumnRight).toBeLessThanOrEqual(layout.visibleRight + 1);
      if (selector === ".city-trend-chart" && width >= 390) {
        expect(layout.fourthColumnRight).toBeLessThanOrEqual(layout.visibleRight + 1);
      }
      if (width >= 768) expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 320) {
        await chart.evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 70, behavior: "instant" }));
        await page.screenshot({ path: `/tmp/house-table-long-label-${selector.slice(1)}.png`, scale: "css" });
      }
      await chart.getByRole("button", { name: "统计图", exact: true }).click();
    }
  }
});

test("full-history rows stay in a bounded table and scrolling can continue to the page", async ({ page }, testInfo) => {
  await page.goto("/?cities=北京,上海,广州,深圳,天津,重庆,成都,杭州,武汉,南京&cityRange=all");
  const city = page.locator(".city-trend-chart");
  await city.getByRole("button", { name: "数据表", exact: true }).click();
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const descriptor = manifest.datasets.find((dataset) => dataset.id === "resale-all-mom")!;
  const [startYear, startMonth] = descriptor.periods[0]!.split("-").map(Number);
  const [endYear, endMonth] = descriptor.periods.at(-1)!.split("-").map(Number);
  const months = (endYear! - startYear!) * 12 + endMonth! - startMonth! + 1;
  await expect(city.locator("tbody tr")).toHaveCount(months * 10);
  const scroll = city.locator(".data-table-scroll");
  await scroll.scrollIntoViewIfNeeded();
  expect((await scroll.boundingBox())!.height).toBeLessThanOrEqual(520);
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(city.locator("tbody tr").last()).toContainText(descriptor.periods[0]!);
  await expect(city.locator("tbody tr").last()).toBeInViewport();

  const ranking = page.locator(".ranking-chart");
  await ranking.getByRole("button", { name: "数据表", exact: true }).click();
  const monthlyScroll = ranking.locator(".data-table-scroll");
  await ranking.evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 70, behavior: "instant" }));
  await monthlyScroll.evaluate((element) => { element.scrollTop = 0; });
  await monthlyScroll.hover();
  const touchSession = testInfo.project.name === "mobile" ? await page.context().newCDPSession(page) : null;
  const scrollDown = async () => {
    if (!touchSession) {
      await page.mouse.wheel(0, 300);
      return;
    }
    const box = (await monthlyScroll.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height - 60;
    await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) {
      await touchSession.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 25 }] });
      await page.waitForTimeout(40);
    }
    await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const pageTop = await page.evaluate(() => scrollY);
  await scrollDown();
  await expect.poll(() => monthlyScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(pageTop);
  await monthlyScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await scrollDown();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageTop);
  await touchSession?.detach();
});
