import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

function extremeChart(page: Page): Locator {
  return page.locator(".compact-chart").filter({
    has: page.getByRole("heading", { name: "首尾城市对比" }),
  });
}

async function findExtremeLabelOverlaps(chart: Locator): Promise<string[]> {
  return chart.locator(".chart-canvas svg").evaluate((svg) => {
    const labels = [...svg.querySelectorAll("text")].map((element) => ({
      text: element.textContent?.trim() ?? "",
      rect: element.getBoundingClientRect(),
    }));
    const cities = labels.filter(({ text }) => /^[\p{Script=Han}]{2,4}$/u.test(text));
    const values = labels.filter(({ text }) => /^[+-]?\d+(?:\.\d+)?%?$/.test(text));
    return cities.flatMap((city) => values.flatMap((value) => {
      const verticalOverlap = Math.min(city.rect.bottom, value.rect.bottom)
        - Math.max(city.rect.top, value.rect.top);
      const horizontalOverlap = Math.min(city.rect.right, value.rect.right)
        - Math.max(city.rect.left, value.rect.left);
      return verticalOverlap > 0 && horizontalOverlap > 0
        ? [`${city.text}:${value.text}`]
        : [];
    }));
  });
}

async function findExtremeActionOverlaps(chart: Locator): Promise<string[]> {
  const actions = chart.locator(".chart-actions");
  if (await actions.count() === 0) return [];
  const actionBox = await actions.boundingBox();
  if (!actionBox) return [];
  const action = {
    left: actionBox.x,
    top: actionBox.y,
    right: actionBox.x + actionBox.width,
    bottom: actionBox.y + actionBox.height,
  };
  return chart.locator(".chart-canvas svg").evaluate((svg, actionRect) => (
    [...svg.querySelectorAll("text")]
      .filter((element) => /^[+-]?\d+(?:\.\d+)?%?$/.test(element.textContent?.trim() ?? ""))
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const verticalOverlap = Math.min(rect.bottom, actionRect.bottom)
          - Math.max(rect.top, actionRect.top);
        const horizontalOverlap = Math.min(rect.right, actionRect.right)
          - Math.max(rect.left, actionRect.left);
        return verticalOverlap > 0 && horizontalOverlap > 0
          ? [element.textContent?.trim() ?? ""]
          : [];
      })
  ), action);
}

async function findYearLabelOverlaps(chart: Locator): Promise<string[]> {
  return chart.locator(".chart-canvas svg").evaluate((svg) => {
    const labels = [...svg.querySelectorAll("text")]
      .filter((element) => /^20\d{2}年$/.test(element.textContent?.trim() ?? ""))
      .map((element) => ({
        text: element.textContent?.trim() ?? "",
        rect: element.getBoundingClientRect(),
      }));
    return labels.flatMap((label, index) => labels.slice(index + 1).flatMap((next) => {
      const verticalOverlap = Math.min(label.rect.bottom, next.rect.bottom)
        - Math.max(label.rect.top, next.rect.top);
      const horizontalOverlap = Math.min(label.rect.right, next.rect.right)
        - Math.max(label.rect.left, next.rect.left);
      return verticalOverlap > 0 && horizontalOverlap > 0
        ? [`${label.text}:${next.text}`]
        : [];
    }));
  });
}

async function expectMobileYearLabels(chart: Locator, firstYear: string): Promise<void> {
  const labels = chart.locator(".chart-canvas svg text").filter({ hasText: /^20\d{2}年$/ });
  await expect(labels.first()).toHaveText(firstYear);
  await expect(labels.last()).toHaveText("2026年");
  await expect.poll(() => findYearLabelOverlaps(chart)).toEqual([]);
  const text = await labels.allTextContents();
  expect(text.length).toBeLessThanOrEqual(6);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator(".summary-item").first()).toBeVisible();
  await expect(page.locator(".chart-canvas svg").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("renders the complete default dashboard without horizontal overflow", async ({ page }, testInfo) => {
  await expect(page.locator(".app-title")).toHaveText("全国 70 城商品住宅价格指数");
  await expect(page.locator(".summary-item").nth(0)).toContainText("70/70");
  await expect(page.locator(".summary-item").last()).toContainText(/\[-?\d+\.\d%, \+?\d+\.\d%\]/);
  await expect(page.locator(".section-title-label")).toHaveText(["价格概览", "价格趋势"]);
  await expect(page.locator(".section-title-meta").first()).toHaveText("二手住宅 · 环比 · 2026年7月");
  await expect(page.locator(".section-title-meta").nth(1)).toHaveText("二手住宅 · 环比");
  await expect(page.getByRole("button", { name: /下载.*CSV/ })).toHaveCount(0);
  await expect(page.locator(".chart-canvas")).toHaveCount(8);
  await expect(page.locator(".collapsible-section")).toHaveCount(2);
  await expect(page.locator(".footer-copyright")).toHaveText(`© ${new Date().getFullYear()} House Price Index`);
  await expect(page.locator(".footer-copyright")).toHaveCSS("white-space", "nowrap");
  await expect(page.locator(".app-footer")).toHaveCSS("font-size", "13px");
  const tierComparison = page.locator(".tier-comparison-chart");
  const distribution = page.locator(".compact-chart").filter({ has: page.getByRole("heading", { name: "城市涨跌分布" }) });
  await expect.poll(() => distribution.locator(".chart-canvas svg text").filter({ hasText: /^15$/ }).count()).toBeGreaterThanOrEqual(2);
  await distribution.screenshot({ path: `/tmp/house-v4-distribution-${testInfo.project.name}.png` });
  await expect(page.locator(".ranking-chart .chart-canvas svg text").filter({ hasText: /^城市$/ })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const headerContent = await page.locator(".app-header-inner").boundingBox();
  const bodyContent = await page.locator(".collapsible-section").first().boundingBox();
  expect(headerContent).not.toBeNull();
  expect(bodyContent).not.toBeNull();
  expect(Math.abs(headerContent!.x - bodyContent!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(headerContent!.x + headerContent!.width - bodyContent!.x - bodyContent!.width)).toBeLessThanOrEqual(1);
  const sourceGap = await page.locator(".collapsible-section").first().evaluate((section) => {
    const meta = section.querySelector(".section-title-meta")?.getBoundingClientRect();
    const action = section.querySelector(".section-actions")?.getBoundingClientRect();
    return meta && action ? Math.round(action.left - meta.right) : -1;
  });
  expect(sourceGap).toBeGreaterThanOrEqual(0);
  expect(sourceGap).toBeLessThanOrEqual(4);
  if (testInfo.project.name === "mobile") {
    const rankingSpacing = await page.locator(".ranking-chart .chart-canvas svg").evaluate((svg) => {
      const rectangles = [...svg.querySelectorAll("*")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { fill: element.getAttribute("fill"), rect };
      });
      const selection = rectangles.find(({ fill, rect }) => fill === "#93b4e8" && rect.width > 100);
      if (!selection) return null;
      const nearestLabelBottom = Math.max(
        ...[...svg.querySelectorAll("text")]
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.bottom <= selection.rect.top && rect.bottom > selection.rect.top - 100)
          .map((rect) => rect.bottom),
      );
      return selection.rect.top - nearestLabelBottom;
    });
    expect(rankingSpacing).not.toBeNull();
    expect(rankingSpacing!).toBeGreaterThanOrEqual(8);
    expect(rankingSpacing!).toBeLessThanOrEqual(30);
  }
  await page.screenshot({ path: `/tmp/house-v4-${testInfo.project.name}.png`, fullPage: true });
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/tmp/house-v4-overview.png", fullPage: false });
  } else {
    await page.screenshot({ path: "/tmp/house-v4-mobile-overview.png", fullPage: false });
  }
  await tierComparison.screenshot({ path: `/tmp/house-v4-tier-comparison-${testInfo.project.name}.png` });
  const flatLabels = tierComparison.locator(".chart-canvas svg text").filter({ hasText: /^持平 \d+$/ });
  await expect(flatLabels).toHaveCount(0);

  expect(await findExtremeLabelOverlaps(extremeChart(page))).toEqual([]);
  expect(await findExtremeActionOverlaps(extremeChart(page))).toEqual([]);

  const barCenters = await tierComparison.locator(".chart-canvas svg").evaluate((svg) => {
    const centers = (color: string) => [...svg.querySelectorAll(`[fill="${color}"]`)]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.height > 15)
      .map((rect) => rect.y + rect.height / 2)
      .sort((left, right) => left - right);
    return { down: centers("#3478d4"), up: centers("#e5484d") };
  });
  expect(barCenters.down).toHaveLength(3);
  expect(barCenters.up).toHaveLength(3);
  barCenters.down.forEach((center, index) => expect(Math.abs(center - barCenters.up[index]!)).toBeLessThanOrEqual(1));

  const tierCanvasBox = await tierComparison.locator(".chart-canvas").boundingBox();
  expect(tierCanvasBox).not.toBeNull();
  const isMobile = testInfo.project.name === "mobile";
  const countGridWidth = isMobile ? tierCanvasBox!.width - 62 - 24 : tierCanvasBox!.width * 0.39;
  const countGridHeight = isMobile ? 185 : tierCanvasBox!.height - 50 - 48;
  await page.mouse.move(
    tierCanvasBox!.x + 62 + countGridWidth / 2,
    tierCanvasBox!.y + (isMobile ? 46 : 50) + countGridHeight / 6,
  );
  await expect(flatLabels).toHaveCount(0);
  await expect(tierComparison.getByText(/上涨 3 城｜持平 1 城｜下跌 0 城/)).toBeVisible();
  await tierComparison.screenshot({ path: `/tmp/house-v4-tier-comparison-hover-${testInfo.project.name}.png` });
  await page.mouse.move(0, 0);
  await page.locator(".app-footer").screenshot({ path: `/tmp/house-v4-footer-${testInfo.project.name}.png` });
});

test("shows only back to top and keeps it above the footer", async ({ page }) => {
  const jump = page.locator(".scroll-jump");
  await expect(jump).toHaveAttribute("aria-label", "回到顶部");
  await expect(jump).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator('[aria-label="前往底部"]')).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(jump).toHaveClass(/is-visible/);
  await expect.poll(async () => {
    const jumpBox = await jump.boundingBox();
    const footerBox = await page.locator(".app-footer").boundingBox();
    return jumpBox && footerBox ? Math.round(footerBox.y - jumpBox.y - jumpBox.height) : -1;
  }).toBeGreaterThanOrEqual(15);

  await jump.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
  await expect(jump).toHaveAttribute("aria-hidden", "true");
});

test("keeps extreme labels separated on narrow mobile charts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only label spacing assertion");
  await page.setViewportSize({ width: 320, height: 844 });
  const cases = [
    "?view=resale-all-mom&period=2026-07",
    "?view=resale-90-144-mom&period=2016-05",
    "?view=resale-90-144-average&period=2018-05",
  ];
  for (const search of cases) {
    await page.goto(`/${search}`);
    const chart = extremeChart(page);
    await expect(chart.locator(".chart-canvas svg")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await findExtremeLabelOverlaps(chart)).toEqual([]);
    expect(await findExtremeActionOverlaps(chart)).toEqual([]);
  }
});

test("keeps full-history year labels separated on narrow mobile charts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only year label spacing assertion");
  await page.setViewportSize({ width: 320, height: 844 });
  const cases = [
    { view: "resale-all-mom", firstYear: "2011年" },
    { view: "resale-under-90-mom", firstYear: "2011年" },
    { view: "new-under-90-mom", firstYear: "2018年" },
  ];
  for (const item of cases) {
    await page.goto(`/?view=${item.view}&period=2026-07`);
    const cityTrend = page.locator(".city-trend-chart");
    await cityTrend.getByRole("button", { name: "全部", exact: true }).click();
    await expectMobileYearLabels(cityTrend, item.firstYear);

    const overallTrend = page.locator(".overall-trend-chart");
    await overallTrend.getByRole("button", { name: "全部", exact: true }).click();
    await expectMobileYearLabels(overallTrend, item.firstYear);
    await overallTrend.getByRole("button", { name: "分层", exact: true }).click();
    await expect(overallTrend.locator(".chart-canvas svg text").filter({ hasText: /^一线（4 城）$/ })).toHaveCount(1);
    await expectMobileYearLabels(overallTrend, item.firstYear);
  }
});

test("updates filters without a document reload", async ({ page }) => {
  await page.locator(".filter-toggle").click();
  const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  await page.locator(".filter-list label").nth(1).locator("select").selectOption({ label: "新建商品住宅" });
  await expect(page.locator(".section-title-meta").first()).toContainText("新建商品住宅");
  await expect(page).toHaveURL(/view=new-all-mom/);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);
});

test("collapses sections and keeps chart controls available", async ({ page }, testInfo) => {
  const firstSection = page.locator(".collapsible-section").first();
  await firstSection.locator(".section-toggle").click();
  await expect(firstSection.locator(".section-content")).toHaveCount(0);
  await firstSection.locator(".section-toggle").click();
  if (testInfo.project.name === "mobile") {
    await expect(firstSection.locator(".chart-actions")).toHaveCount(0);
  } else {
    await expect(firstSection.locator(".chart-actions button")).not.toHaveCount(0);
  }
});

test("mobile summary uses four columns", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only layout assertion");
  const boxes = await page.locator(".summary-item").evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y) };
    }),
  );
  expect(new Set(boxes.slice(0, 4).map((box) => box.y)).size).toBe(1);
  expect(boxes[4]?.y).toBeGreaterThan(boxes[0]?.y ?? 0);
});

test("filter drawer overlays the dashboard and restores defaults", async ({ page }, testInfo) => {
  const mainBefore = await page.locator(".app-main").boundingBox();
  await page.locator(".filter-toggle").click();
  const drawer = page.locator(".filter-drawer");
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await expect.poll(async () => {
    const box = await drawer.boundingBox();
    return box ? Math.abs(box.x + box.width - page.viewportSize()!.width) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(1);
  const drawerBox = await drawer.boundingBox();
  const mainAfter = await page.locator(".app-main").boundingBox();
  expect(drawerBox).not.toBeNull();
  expect(Math.abs((mainAfter?.x ?? -1) - (mainBefore?.x ?? 0))).toBeLessThanOrEqual(1);
  expect((await page.locator(".app-header").boundingBox())?.x).toBe(0);
  await expect(drawer.locator(".filter-select > svg")).toHaveCount(4);
  if (testInfo.project.name === "mobile") {
    expect(drawerBox!.width).toBeCloseTo(Math.min(360, page.viewportSize()!.width - 52), 0);
  }

  const closeButton = drawer.getByRole("button", { name: "关闭筛选" });
  await closeButton.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", { name: "完成" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();

  await drawer.locator(".filter-list label").nth(1).locator("select").selectOption({ label: "新建商品住宅" });
  await expect(page.locator(".section-title-meta").first()).toContainText("新建商品住宅");
  await expect(page.locator(".filter-count")).toHaveText("1");
  await drawer.getByRole("button", { name: "恢复默认" }).click();
  await expect(page.locator(".section-title-meta").first()).toContainText("二手住宅");
  await expect(page.locator(".filter-count")).toHaveCount(0);

  await page.screenshot({ path: `/tmp/house-v4-filter-drawer-${testInfo.project.name}.png`, fullPage: false });
  await drawer.getByRole("button", { name: "完成" }).click();
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

  await page.locator(".filter-toggle").click();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".filter-toggle")).toBeFocused();
});

test("chart download and fullscreen controls work", async ({ page }, testInfo) => {
  const firstChart = page.locator(".chart-shell").first();
  const downloadButton = firstChart.getByRole("button", { name: "下载图表" });
  const fullscreenButton = firstChart.getByRole("button", { name: "全屏查看" });
  if (testInfo.project.name === "mobile") {
    await expect(downloadButton).toHaveCount(0);
    await expect(fullscreenButton).toHaveCount(0);
    return;
  }

  await firstChart.hover();
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/城市排名\.png$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const signature = (await readFile(downloadPath!)).subarray(0, 8);
  expect([...signature]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await download.saveAs(`/tmp/house-v4-download-${testInfo.project.name}.png`);

  await fullscreenButton.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("chart-shell") ?? false)).toBe(true);
  const exitFullscreenButton = firstChart.getByRole("button", { name: "退出全屏" });
  await expect(exitFullscreenButton).toBeVisible();
  await exitFullscreenButton.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement == null)).toBe(true);
  await expect(firstChart.getByRole("button", { name: "全屏查看" })).toBeVisible();
});

test("persists trend controls and scopes missing-data notes to the visible range", async ({ page }) => {
  const overallTrend = page.locator(".overall-trend-chart");
  const cityTrend = page.locator(".city-trend-chart");
  await expect(overallTrend.locator(".trend-note")).toContainText("18 个月份");
  await expect(cityTrend.getByRole("button", { name: "近5年", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cityTrend.locator(".trend-note")).toHaveCount(0);

  await overallTrend.getByRole("button", { name: "广度", exact: true }).click();
  await expect(overallTrend.getByText(/市场广度 =/)).toBeVisible();
  await overallTrend.getByRole("button", { name: "分层", exact: true }).click();
  await overallTrend.getByRole("button", { name: "近5年", exact: true }).click();
  await cityTrend.getByRole("button", { name: "近3年", exact: true }).click();
  await expect(overallTrend.locator(".trend-note")).toHaveCount(0);
  await expect(cityTrend.locator(".trend-note")).toHaveCount(0);
  await expect(page).toHaveURL(/trend=tier/);
  await expect(page).toHaveURL(/range=5y/);
  await expect(page).toHaveURL(/cityRange=3y/);

  await page.reload();
  await expect(overallTrend.getByRole("button", { name: "分层", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(overallTrend.getByRole("button", { name: "近5年", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cityTrend.getByRole("button", { name: "近3年", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("groups monthly views with overview and trend sections", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const overviewSection = page.locator(".collapsible-section").nth(0);
  const trendSection = page.locator(".collapsible-section").nth(1);
  const heatmap = trendSection.locator(".heatmap-chart");
  const comparison = overviewSection.locator(".quadrant-chart");
  await expect(overviewSection.getByRole("heading", { level: 3 })).toHaveText([
    "城市排名",
    "首尾城市对比",
    "城市涨跌分布",
    "城市层级对比",
    "城市环比与同比",
  ]);
  await expect(trendSection.getByRole("heading", { level: 3 })).toHaveText(["整体趋势", "城市趋势", "走势对比"]);
  await expect(page.locator(".analysis-view-tabs")).toHaveCount(0);
  await expect(heatmap.locator(".chart-canvas svg")).toBeVisible();
  await expect(comparison.locator(".chart-canvas svg")).toBeVisible();
  await expect(page.locator(".chart-canvas")).toHaveCount(8);
  await expect(heatmap.getByText("层级", { exact: true })).toHaveCount(0);
  await expect(heatmap.getByText("时间范围", { exact: true })).toHaveCount(0);
  const controlBoxes = await heatmap.locator(".analysis-filter-control").evaluateAll((controls) => controls.map((control) => {
    const rect = control.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
  }));
  expect(controlBoxes).toHaveLength(2);
  expect(Math.abs(controlBoxes[0]!.width - controlBoxes[1]!.width)).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "desktop") {
    expect(controlBoxes[0]!.right).toBeLessThan(controlBoxes[1]!.left);
    expect(Math.abs(controlBoxes[0]!.top - controlBoxes[1]!.top)).toBeLessThanOrEqual(1);
  } else {
    expect(controlBoxes[0]!.bottom).toBeLessThanOrEqual(controlBoxes[1]!.top);
    expect(Math.abs(controlBoxes[0]!.left - controlBoxes[1]!.left)).toBeLessThanOrEqual(1);
    const toolbarBox = await heatmap.locator(".paired-chart-controls").boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(Math.abs(controlBoxes[0]!.width - toolbarBox!.width)).toBeLessThanOrEqual(1);
  }
  const rangeTabs = heatmap.getByRole("group", { name: "热力图时间范围" });
  await expect(rangeTabs.getByRole("button")).toHaveCount(4);
  await expect(rangeTabs.getByRole("button")).toHaveText(["全部", "近3年", "近5年", "近10年"]);
  await expect(rangeTabs.getByRole("button", { name: "近3年", exact: true })).toHaveAttribute("aria-pressed", "true");
  await rangeTabs.getByRole("button", { name: "全部", exact: true }).click();
  await expect(rangeTabs.getByRole("button", { name: "全部", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(350);
  const visibleStartPeriod = testInfo.project.name === "mobile" ? "25年8月" : "23年8月";
  await expect(heatmap.locator(".chart-canvas svg text").filter({ hasText: new RegExp(`^${visibleStartPeriod}$`) })).toBeVisible();
  await expect(heatmap.locator(".chart-canvas svg text").filter({ hasText: /^26年7月$/ })).toBeVisible();
  const screenshotStyle = await page.addStyleTag({ content: ".app-header { visibility: hidden !important; }" });
  await heatmap.screenshot({ path: `/tmp/house-v4-heatmap-${testInfo.project.name}.png` });
  await screenshotStyle.evaluate((element) => element.remove());

  await expect(comparison.locator(".analysis-caption")).toContainText("共同覆盖 70/70 城");
  await expect(comparison.locator(".chart-canvas svg text").filter({ hasText: /^(双升|双降)$/ })).toHaveCount(2);
  await page.waitForTimeout(350);
  await comparison.screenshot({ path: `/tmp/house-v4-quadrant-${testInfo.project.name}.png` });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("tier trend and city selection render client-side", async ({ page }, testInfo) => {
  const trend = page.locator(".overall-trend-chart");
  const modeBox = await trend.locator(".trend-mode-row").boundingBox();
  const rangeBox = await trend.locator(".trend-range-row").boundingBox();
  expect(modeBox).not.toBeNull();
  expect(rangeBox).not.toBeNull();
  expect(Math.abs(modeBox!.width - rangeBox!.width)).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "mobile") {
    expect(modeBox!.y + modeBox!.height).toBeLessThanOrEqual(rangeBox!.y);
    expect(Math.abs(modeBox!.x - rangeBox!.x)).toBeLessThanOrEqual(1);
    const toolbarBox = await trend.locator(".paired-chart-controls").boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(Math.abs(modeBox!.width - toolbarBox!.width)).toBeLessThanOrEqual(1);
  } else {
    expect(modeBox!.x + modeBox!.width).toBeLessThan(rangeBox!.x);
    expect(Math.abs(modeBox!.y - rangeBox!.y)).toBeLessThanOrEqual(1);
  }
  const overallCanvasBox = await trend.locator(".chart-canvas").boundingBox();
  const overallLegendBox = await trend.locator(".chart-canvas svg text").filter({ hasText: /^上涨$/ }).boundingBox();
  expect(overallCanvasBox).not.toBeNull();
  expect(overallLegendBox).not.toBeNull();
  expect(overallLegendBox!.y).toBeGreaterThan(overallCanvasBox!.y + overallCanvasBox!.height * 0.88);
  if (testInfo.project.name === "mobile") {
    const yearBox = await trend.locator(".chart-canvas svg text").filter({ hasText: /^2026年$/ }).boundingBox();
    expect(yearBox).not.toBeNull();
    const gap = overallLegendBox!.y - (yearBox!.y + yearBox!.height);
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(30);
  }
  await trend.screenshot({ path: `/tmp/house-v4-overall-trend-${testInfo.project.name}.png` });

  await trend.locator(".trend-mode-row").getByRole("button", { name: "分层" }).click();
  await expect(trend.locator(".chart-canvas")).toHaveCSS("height", "640px");
  await expect.poll(async () => trend.locator("svg path").count()).toBeGreaterThan(20);
  const tierCanvasBox = await trend.locator(".chart-canvas").boundingBox();
  const tierLegendBox = await trend.locator(".chart-canvas svg text").filter({ hasText: /^上涨$/ }).boundingBox();
  expect(tierCanvasBox).not.toBeNull();
  expect(tierLegendBox).not.toBeNull();
  expect(tierLegendBox!.y).toBeGreaterThan(tierCanvasBox!.y + tierCanvasBox!.height * 0.9);
  if (testInfo.project.name === "mobile") {
    const yearBox = await trend.locator(".chart-canvas svg text").filter({ hasText: /^2026年$/ }).boundingBox();
    expect(yearBox).not.toBeNull();
    const gap = tierLegendBox!.y - (yearBox!.y + yearBox!.height);
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(30);
  }

  const defaultCityTrend = page.locator(".city-trend-chart");
  await defaultCityTrend.screenshot({ path: `/tmp/house-v4-city-trend-default-${testInfo.project.name}.png` });

  const cityPicker = page.locator(".city-picker");
  await cityPicker.getByRole("button", { name: "选择城市" }).click();
  await expect(cityPicker.locator(".city-option-group-title")).toHaveText(["一线（4）", "二线（31）", "三线（35）"]);
  await page.screenshot({ path: `/tmp/house-v4-city-picker-${testInfo.project.name}.png`, fullPage: false });
  await cityPicker.getByPlaceholder("搜索城市").fill("南京");
  await expect(cityPicker.locator(".city-option-group-title")).toHaveText(["二线（1/31）"]);
  await cityPicker.getByRole("button", { name: "南京", exact: true }).click();
  for (const city of ["天津", "重庆", "成都", "杭州", "武汉"]) {
    await cityPicker.getByPlaceholder("搜索城市").fill(city);
    await cityPicker.getByRole("button", { name: city, exact: true }).click();
  }
  await expect(cityPicker.locator(".city-tag")).toHaveCount(10);
  await expect(cityPicker.locator(".city-picker-hint")).toHaveText("最多选择 10 个城市");
  await cityPicker.getByPlaceholder("搜索城市").fill("西安");
  await expect(cityPicker.getByRole("button", { name: "西安", exact: true })).toBeDisabled();
  await cityPicker.getByRole("button", { name: "选择城市" }).click();

  const cityTrend = page.locator(".city-trend-chart");
  await expect(cityTrend.getByRole("button", { name: "近5年", exact: true })).toHaveAttribute("aria-pressed", "true");
  const cityCanvasBox = await cityTrend.locator(".chart-canvas").boundingBox();
  const cityLegendBox = await cityTrend.locator(".chart-canvas svg text").filter({ hasText: /^北京$/ }).boundingBox();
  expect(cityCanvasBox).not.toBeNull();
  expect(cityLegendBox).not.toBeNull();
  expect(cityLegendBox!.y).toBeGreaterThan(cityCanvasBox!.y + cityCanvasBox!.height * 0.88);
  if (testInfo.project.name === "mobile") {
    const yearBox = await cityTrend.locator(".chart-canvas svg text").filter({ hasText: /^2026年$/ }).boundingBox();
    expect(yearBox).not.toBeNull();
    const gap = cityLegendBox!.y - (yearBox!.y + yearBox!.height);
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(30);
  }
  await cityTrend.screenshot({ path: `/tmp/house-v4-city-trend-10-${testInfo.project.name}.png` });

  if (testInfo.project.name === "desktop") {
    await page.addStyleTag({ content: ".app-header { visibility: hidden !important; }" });
    await trend.scrollIntoViewIfNeeded();
    const box = await trend.boundingBox();
    expect(box).not.toBeNull();
    await page.screenshot({
      path: "/tmp/house-v4-tier-trend.png",
      clip: { x: box!.x, y: box!.y, width: box!.width, height: box!.height + 24 },
    });
  }
});
