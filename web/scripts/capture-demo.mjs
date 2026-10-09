import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, devices, expect } from "@playwright/test";

const baseURL = process.env.DEMO_BASE_URL || "http://127.0.0.1:5173";
const output = new URL("../../demo/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

async function openPage(options) {
  const page = await browser.newPage({ baseURL, locale: "zh-CN", reducedMotion: "reduce", ...options });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || (message.type() === "warning" && message.text().includes("[ECharts]"))) errors.push(message.text());
  });
  return page;
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), animations: "disabled" });
  console.log(`Updated demo/${name}`);
}

try {
  const desktop = await openPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await desktop.goto("/");
  await expect(desktop.locator(".city-matrix-cell")).toHaveCount(70);
  await expect(desktop.locator(".chart-canvas svg").first()).toBeVisible();
  await capture(desktop, "overview.png");
  await desktop.locator(".filter-toggle").click();
  await expect(desktop.locator(".filter-drawer")).toHaveClass(/is-open/);
  await capture(desktop, "sidebar.png");

  await desktop.goto("/?section=history&trend=tier");
  await expect(desktop.locator(".overall-trend-chart .chart-canvas svg")).toBeVisible();
  await expect(desktop.locator(".heatmap-chart .chart-canvas svg")).toBeVisible();
  await capture(desktop, "tier-trend.png");

  await desktop.setViewportSize({ width: 1440, height: 1080 });
  await desktop.goto("/?section=cities&city=北京&cities=北京,上海,成都");
  await expect(desktop.locator(".city-history-table")).toHaveAttribute("aria-busy", "false");
  await expect(desktop.locator(".city-trend-chart .chart-canvas svg")).toBeVisible();
  await expect(desktop.locator(".interval-index-chart .chart-canvas svg")).toBeVisible();
  await capture(desktop, "city-board.png");

  const mobile = await openPage({ ...devices["iPhone 13"], deviceScaleFactor: 1 });
  await mobile.goto("/");
  await expect(mobile.locator(".city-matrix-cell")).toHaveCount(70);
  await expect(mobile.locator(".task-navigation")).toBeVisible();
  await expect(mobile.locator(".mobile-chart-download").first()).toBeEnabled();
  await capture(mobile, "mobile.png");
} finally {
  await browser.close();
}
