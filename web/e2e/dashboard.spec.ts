import { expect, test } from "@playwright/test";

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
  await expect(page.locator(".summary-item").nth(0)).toContainText("70");
  await expect(page.locator(".chart-canvas")).toHaveCount(6);
  await expect(page.locator(".footer-copyright")).toHaveText(`© ${new Date().getFullYear()} House Price Index`);
  await expect(page.locator(".footer-copyright")).toHaveCSS("white-space", "nowrap");
  await expect(page.locator(".app-footer")).toHaveCSS("font-size", "13px");
  const tierComparison = page.locator(".tier-comparison-chart");
  await expect(page.locator(".ranking-chart .chart-canvas svg text").filter({ hasText: /^城市$/ })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const headerContent = await page.locator(".app-header-inner").boundingBox();
  const bodyContent = await page.locator(".collapsible-section").first().boundingBox();
  expect(headerContent).not.toBeNull();
  expect(bodyContent).not.toBeNull();
  expect(Math.abs(headerContent!.x - bodyContent!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(headerContent!.x + headerContent!.width - bodyContent!.x - bodyContent!.width)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `/tmp/house-v4-${testInfo.project.name}.png`, fullPage: true });
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/tmp/house-v4-overview.png", fullPage: false });
  } else {
    await page.screenshot({ path: "/tmp/house-v4-mobile-overview.png", fullPage: false });
  }
  await tierComparison.screenshot({ path: `/tmp/house-v4-tier-comparison-${testInfo.project.name}.png` });
  const flatLabels = tierComparison.locator(".chart-canvas svg text").filter({ hasText: /^持平 \d+$/ });
  await expect(flatLabels).toHaveCount(0);

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

test("updates filters without a document reload", async ({ page }) => {
  await page.locator(".filter-toggle").click();
  const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  await page.locator(".filter-list label").nth(1).locator("select").selectOption({ label: "新建商品住宅" });
  await expect(page.locator(".section-toggle").first()).toContainText("新建商品住宅");
  await expect(page).toHaveURL(/view=new-all-mom/);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);
});

test("collapses sections and keeps chart controls available", async ({ page }) => {
  const firstSection = page.locator(".collapsible-section").first();
  await firstSection.locator(".section-toggle").click();
  await expect(firstSection.locator(".section-content")).toHaveCount(0);
  await firstSection.locator(".section-toggle").click();
  await expect(firstSection.locator(".chart-actions button")).not.toHaveCount(0);
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

  const closeButton = drawer.getByRole("button", { name: "关闭筛选" });
  await closeButton.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", { name: "完成" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();

  await drawer.locator(".filter-list label").nth(1).locator("select").selectOption({ label: "新建商品住宅" });
  await expect(page.locator(".section-toggle").first()).toContainText("新建商品住宅");
  await expect(page.locator(".filter-count")).toHaveText("1");
  await drawer.getByRole("button", { name: "恢复默认" }).click();
  await expect(page.locator(".section-toggle").first()).toContainText("二手住宅");
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

test("chart download and fullscreen controls work", async ({ page }) => {
  const firstChart = page.locator(".chart-shell").first();
  await firstChart.hover();
  const downloadPromise = page.waitForEvent("download");
  await firstChart.getByRole("button", { name: "下载图表" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/城市排名\.svg$/);

  await firstChart.getByRole("button", { name: "全屏查看" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("chart-shell") ?? false)).toBe(true);
  await page.keyboard.press("Escape");
});

test("tier trend and city selection render client-side", async ({ page }, testInfo) => {
  const trend = page.locator(".overall-trend-chart");
  if (testInfo.project.name === "mobile") {
    const modeBox = await trend.locator(".trend-mode-row").boundingBox();
    const rangeBox = await trend.locator(".trend-range-row").boundingBox();
    expect(modeBox).not.toBeNull();
    expect(rangeBox).not.toBeNull();
    expect(modeBox!.y + modeBox!.height).toBeLessThanOrEqual(rangeBox!.y);
  }
  const overallCanvasBox = await trend.locator(".chart-canvas").boundingBox();
  const overallLegendBox = await trend.locator(".chart-canvas svg text").filter({ hasText: /^上涨$/ }).boundingBox();
  expect(overallCanvasBox).not.toBeNull();
  expect(overallLegendBox).not.toBeNull();
  expect(overallLegendBox!.y).toBeGreaterThan(overallCanvasBox!.y + overallCanvasBox!.height * 0.88);
  await trend.screenshot({ path: `/tmp/house-v4-overall-trend-${testInfo.project.name}.png` });

  await trend.locator(".trend-mode-row").getByRole("button", { name: "分层" }).click();
  await expect(trend.locator(".chart-canvas")).toHaveCSS("height", "640px");
  await expect.poll(async () => trend.locator("svg path").count()).toBeGreaterThan(20);
  const tierCanvasBox = await trend.locator(".chart-canvas").boundingBox();
  const tierLegendBox = await trend.locator(".chart-canvas svg text").filter({ hasText: /^上涨$/ }).boundingBox();
  expect(tierCanvasBox).not.toBeNull();
  expect(tierLegendBox).not.toBeNull();
  expect(tierLegendBox!.y).toBeGreaterThan(tierCanvasBox!.y + tierCanvasBox!.height * 0.9);

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
  const cityCanvasBox = await cityTrend.locator(".chart-canvas").boundingBox();
  const cityLegendBox = await cityTrend.locator(".chart-canvas svg text").filter({ hasText: /^北京$/ }).boundingBox();
  expect(cityCanvasBox).not.toBeNull();
  expect(cityLegendBox).not.toBeNull();
  expect(cityLegendBox!.y).toBeGreaterThan(cityCanvasBox!.y + cityCanvasBox!.height * 0.88);
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
