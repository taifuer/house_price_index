import { expect, test } from "@playwright/test";

test("task navigation retains filters, supports history and mounts only the active charts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let documentRequests = 0;
  let shardRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
    if (request.url().includes("/data/shards/new-all-mom.json")) shardRequests++;
  });
  await page.goto("/?view=new-all-mom&period=2026-07");
  const nav = page.getByRole("navigation", { name: "数据视图" });
  await expect(nav.getByRole("link")).toHaveText(["月度概览", "历史趋势", "城市看板"]);
  await expect(page.locator(".city-matrix-cell")).toHaveCount(70);
  await expect(page.locator(".chart-canvas")).toHaveCount(4);
  await expect(page.locator(".heatmap-chart, .city-trend-chart")).toHaveCount(0);
  await page.locator(".city-overview").getByRole("button", { name: "二线", exact: true }).click();
  await nav.getByRole("link", { name: "历史趋势" }).click();
  await expect(nav.getByRole("link", { name: "历史趋势" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".city-overview, .city-trend-chart")).toHaveCount(0);
  await expect(page.locator(".chart-canvas")).toHaveCount(2);
  await expect(page.locator(".section-title-meta")).toHaveText("新建商品住宅 · 环比");
  await expect(page.locator(".heatmap-chart svg text").filter({ hasText: /^2026-08$/ })).toHaveCount(2);
  await page.locator(".filter-toggle").click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("combobox", { name: "月份", exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("combobox", { name: "住宅类型", exact: true })).toBeFocused();
  await drawer.getByRole("button", { name: "完成" }).click();
  const heatmap = page.locator(".heatmap-chart");
  await heatmap.getByRole("button", { name: "二线", exact: true }).click();
  await heatmap.getByRole("button", { name: "近5年", exact: true }).click();
  await page.locator(".overall-trend-chart").getByRole("button", { name: "分层", exact: true }).click();
  await nav.getByRole("link", { name: "城市看板" }).click();
  await expect(page.locator(".heatmap-chart, .city-overview")).toHaveCount(0);
  await expect(page.locator(".city-trend-chart .city-tag")).toHaveCount(1);
  await page.locator(".city-trend-chart").getByRole("button", { name: "近3年", exact: true }).click();
  await page.goBack();
  await expect(nav.getByRole("link", { name: "历史趋势" })).toHaveAttribute("aria-current", "page");
  await expect(heatmap.getByRole("button", { name: "二线", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(heatmap.getByRole("button", { name: "近5年", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".overall-trend-chart").getByRole("button", { name: "分层", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(page.locator(".city-trend-chart").getByRole("button", { name: "近3年", exact: true })).toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("link", { name: "月度概览" }).click();
  await expect(page.locator(".city-matrix-cell")).toHaveCount(31);
  await expect(page.locator(".section-title-meta")).toContainText("2026年7月");
  expect(documentRequests).toBe(1);
  expect(shardRequests).toBe(1);
  expect(errors).toEqual([]);
  await nav.getByRole("link", { name: "城市看板" }).click();
  await page.reload();
  await expect(nav.getByRole("link", { name: "城市看板" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".city-trend-chart").getByRole("button", { name: "近3年", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("navigation fits mobile, tablet and desktop without hiding the title or overlapping content", async ({ page }, testInfo) => {
  await page.goto("/");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const nav = page.getByRole("navigation", { name: "数据视图" });
    for (const label of ["月度概览", "历史趋势", "城市看板"]) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page.locator(".dashboard-section")).toBeVisible();
      const layout = await page.evaluate(() => {
        const header = document.querySelector(".app-header")!.getBoundingClientRect();
        const content = document.querySelector(".section-heading")!.getBoundingClientRect();
        const title = document.querySelector(".app-title")!;
        const links = [...document.querySelectorAll(".task-navigation a")].map((link) => link.getBoundingClientRect());
        const filter = document.querySelector(".filter-toggle")!.getBoundingClientRect();
        const titleBox = title.getBoundingClientRect();
        return {
          headerHeight: header.height,
          titleToolCenterOffset: titleBox.top + titleBox.height / 2 - filter.top - filter.height / 2,
          overflow: document.documentElement.scrollWidth - innerWidth,
          titleOverflow: title.scrollWidth - title.clientWidth,
          contentGap: content.top - header.bottom,
          links: links.map((link) => ({ top: link.top, bottom: link.bottom, width: link.width })),
          filterBottom: filter.bottom,
        };
      });
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(layout.headerHeight).toBe(width < 768 ? 96 : 64);
      expect(Math.abs(layout.titleToolCenterOffset)).toBeLessThanOrEqual(1);
      expect(layout.titleOverflow).toBeLessThanOrEqual(1);
      expect(layout.contentGap).toBeGreaterThanOrEqual(15);
      if (width < 768) {
        expect(new Set(layout.links.map((link) => link.top)).size).toBe(1);
        expect(layout.links[0]!.top).toBeGreaterThanOrEqual(layout.filterBottom);
        expect(Math.max(...layout.links.map((link) => link.width)) - Math.min(...layout.links.map((link) => link.width))).toBeLessThan(1);
      }
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: `/tmp/house-navigation-${width}-${label}-${testInfo.project.name}.png` });
      }
    }
  }
});
