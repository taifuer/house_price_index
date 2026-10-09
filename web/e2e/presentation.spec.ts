import { expect, test } from "@playwright/test";
import type { DatasetShard, Manifest } from "../src/types";
import { formatPct, roundOne } from "../src/lib/format";

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => { throw error; });
});

test("city matrix stays chart-only and follows monthly filters", async ({ page }) => {
  await page.goto("/?view=resale-all-mom&period=2026-08");
  const overview = page.locator(".city-overview");
  await expect(overview.locator(".city-matrix-cell")).toHaveCount(70);
  const manifest = await (await page.request.get("/data/manifest.json")).json() as Manifest;
  const descriptor = manifest.datasets.find((dataset) => dataset.id === "new-all-mom")!;
  const shard = await (await page.request.get(`/data/${descriptor.path}`)).json() as DatasetShard;
  for (const period of ["2026-08", "2026-07"]) {
    await page.locator(".filter-toggle").click();
    await page.locator(".filter-list label").nth(1).locator("select").selectOption({ label: "新建商品住宅" });
    await page.locator(".filter-list label").nth(0).locator("select").selectOption(period);
    await page.getByRole("button", { name: "完成", exact: true }).click();
    const values = shard.values[shard.periods.indexOf(period)]!;
    const orderedValues = ["一线", "二线", "三线"].flatMap((tier) => manifest.cities.flatMap((city, index) => city.tier === tier ? [values[index]] : []));
    await expect(overview.locator(".city-matrix-cell > strong")).toHaveText(orderedValues.map((value) => value == null ? "—" : formatPct(roundOne(value - 100))));
    await expect(overview.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "数据表", exact: true })).toHaveCount(0);
  }
});

test("city trends retain chart controls and the monthly snapshot without table mode", async ({ page }) => {
  await page.goto("/?section=cities&city=北京&cities=北京,上海&cityRange=3y");
  const trend = page.locator(".city-trend-chart");
  await expect(trend.locator(".chart-canvas svg")).toBeVisible();
  const controls = page.locator(".city-history-controls");
  await expect(controls.locator(".city-tag-name")).toHaveText(["北京", "上海"]);
  await expect(page.locator(".city-snapshot-table tbody tr")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "数据表", exact: true })).toHaveCount(0);
  await expect(trend.getByRole("table")).toHaveCount(0);
  await controls.getByRole("button", { name: "全部", exact: true }).click();
  await page.getByRole("combobox", { name: "走势指标", exact: true }).selectOption("累计平均");
  await expect(trend.locator(".trend-note")).toContainText("数据缺失");
  await page.reload();
  await expect(controls.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(trend.locator(".chart-canvas svg")).toBeVisible();
  await controls.getByRole("button", { name: "移除上海", exact: true }).click();
  await expect(controls.getByRole("button", { name: "移除北京", exact: true })).toHaveCount(0);
  await expect(trend.locator(".chart-canvas")).toHaveCount(1);
  await expect(page.locator(".city-history-table tbody tr")).toHaveCount(12);
});

test("dropdowns use consistent typography with one shared historical toolbar", async ({ page }, testInfo) => {
  await page.goto("/?section=cities");
  await expect(page.locator(".city-trend-chart .chart-canvas svg")).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const styles = await page.locator(".app-main .filter-select select").evaluateAll((selects) => selects.map((select) => {
      const style = getComputedStyle(select);
      return [style.fontSize, style.fontWeight, style.lineHeight, style.height, style.borderRadius, style.padding];
    }));
    expect(styles).toHaveLength(5);
    for (const style of styles) expect(style).toEqual(styles[0]);
    expect(styles[0]!.slice(0, 2)).toEqual(["13px", "400"]);
    expect(styles[0]![3]).toBe("40px");
    for (const label of await page.locator(".city-history-filters label > span:first-child").all()) {
      await expect(label).toHaveCSS("font-size", "13px");
      await expect(label).toHaveCSS("line-height", "20px");
    }
    await expect(page.locator(".app-main .segmented")).toHaveCount(1);
    for (const range of await page.locator(".app-main .segmented").all()) {
      expect((await range.boundingBox())!.height).toBe(40);
    }
    const controls = (await page.locator(".city-history-controls").boundingBox())!;
    const heading = (await page.locator(".city-trend-chart .chart-heading-row").boundingBox())!;
    expect(heading.y).toBeGreaterThanOrEqual(controls.y + controls.height);
    expect(Math.abs(controls.x - heading.x)).toBeLessThanOrEqual(1);
    await expect(page.locator(".app-main .city-picker")).toHaveCount(1);
    await page.locator(".filter-toggle").click();
    const area = page.locator(".filter-list select");
    await expect(area).toHaveCSS("font-size", "13px");
    await expect(area).toHaveCSS("height", "40px");
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await expect(page.locator(".filter-drawer")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `/tmp/house-refined-city-${width}-${testInfo.project.name}.png`, fullPage: true });
    }
  }
});

test("all task views share the same control height at narrow and desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [section, count] of [["月度概览", 1], ["历史趋势", 4], ["城市看板", 1]] as const) {
      await page.getByRole("navigation").getByRole("link", { name: section, exact: true }).click();
      await expect(page.locator(".app-main .segmented")).toHaveCount(count);
      const controls = await page.locator(".app-main .segmented, .app-main .filter-select select").evaluateAll((elements) => elements.map((element) => ({
        height: element.getBoundingClientRect().height,
        overflow: element.scrollWidth - element.clientWidth,
      })));
      for (const control of controls) {
        expect(control.height).toBe(40);
        expect(control.overflow).toBeLessThanOrEqual(1);
      }
      const clippedLabels = await page.locator(".app-main .segmented button").evaluateAll((buttons) => buttons.filter((button) =>
        button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1,
      ).map((button) => button.textContent));
      expect(clippedLabels).toEqual([]);
      const controlFonts = await page.locator(".app-main .segmented button, .app-main .filter-select select").evaluateAll((elements) =>
        elements.map((element) => [getComputedStyle(element).fontSize, getComputedStyle(element).lineHeight]),
      );
      expect(controlFonts.every(([size, height]) => size === "13px" && height === "20px")).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  }
});

test("page and chart headings keep a shared readable hierarchy across all views", async ({ page }, testInfo) => {
  await page.goto("/?period=2026-08&city=乌鲁木齐");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ["月度概览", "历史趋势", "城市看板"]) {
      await page.getByRole("navigation").getByRole("link", { name: section, exact: true }).click();
      await expect(page.locator(".chart-canvas svg").first()).toBeVisible();
      const title = page.locator(".section-title, .city-page-title");
      await expect(title).toHaveCSS("font-size", width < 768 ? "18px" : "20px");
      await expect(title).toHaveCSS("line-height", width < 768 ? "26px" : "28px");
      await expect(title).toHaveCSS("font-weight", "600");
      await expect(page.locator(".section-heading")).toHaveCSS("min-height", width < 768 ? "44px" : "48px");
      const chartTitles = page.locator(".chart-block h3");
      expect(await chartTitles.count()).toBeGreaterThan(0);
      for (const heading of await chartTitles.all()) {
        await expect(heading).toHaveCSS("font-size", "16px");
        await expect(heading).toHaveCSS("line-height", "24px");
        await expect(heading).toHaveCSS("font-weight", "600");
      }
      const clipped = await page.locator(".app-title, .section-title, .city-page-title, .chart-block h3, .summary-item strong").evaluateAll((elements) =>
        elements.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map((element) => element.textContent),
      );
      expect(clipped).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 390 || width === 1440) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({ path: `/tmp/house-type-${width}-${section}-${testInfo.project.name}.png` });
      }
    }
  }
});

test("footer uses equal separator gaps and centered mobile lines without overflow", async ({ page }, testInfo) => {
  await page.goto("/?section=cities");
  await expect(page.locator(".city-trend-chart .chart-canvas svg")).toBeVisible();
  await expect(page.locator(".interval-index-chart .chart-canvas svg")).toBeVisible();
  const footer = page.locator(".app-footer");
  await expect(footer.locator(".footer-source")).toHaveText("数据来源于 国家统计局，以官方发布为准");
  await expect(footer.getByRole("link", { name: "House Price Index", exact: true })).toHaveCSS("font-weight", "600");
  await expect(footer.getByRole("link", { name: "国家统计局", exact: true })).toHaveAttribute("href", "https://www.stats.gov.cn/");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await footer.scrollIntoViewIfNeeded();
    const copyright = (await footer.locator(".footer-copyright").boundingBox())!;
    const source = (await footer.locator(".footer-source").boundingBox())!;
    if (width < 768) {
      await expect(footer).toHaveCSS("font-size", "12px");
      await expect(footer).toHaveCSS("line-height", "20px");
      await expect(footer).toHaveCSS("border-top-width", "0px");
      await expect(footer).toHaveCSS("position", "static");
      await expect(footer.locator(".footer-separator")).toBeHidden();
      expect(Math.abs(copyright.x + copyright.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(source.x + source.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      expect(source.y).toBeGreaterThanOrEqual(copyright.y + copyright.height);
    } else {
      await expect(footer).toHaveCSS("font-size", "13px");
      const separator = (await footer.locator(".footer-separator").boundingBox())!;
      expect(separator.x - copyright.x - copyright.width).toBeCloseTo(8, 1);
      expect(source.x - separator.x - separator.width).toBeCloseTo(8, 1);
      expect(Math.abs(copyright.y - source.y)).toBeLessThanOrEqual(1);
    }
    expect(source.x).toBeGreaterThanOrEqual(16);
    expect(source.x + source.width).toBeLessThanOrEqual(width - 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await footer.screenshot({ path: `/tmp/house-refined-footer-${width}-${testInfo.project.name}.png` });
  }
});
