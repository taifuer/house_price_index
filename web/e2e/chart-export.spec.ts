import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

declare global {
  interface Window {
    exportProbe: { texts: string[]; svgs: string[]; outputs: HTMLCanvasElement[]; urls: string[]; revoked: string[] };
  }
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw error; });
  page.on("console", (message) => {
    if (message.type() === "error" || (message.type() === "warning" && message.text().includes("[ECharts]"))) throw new Error(message.text());
  });
  await page.addInitScript(() => {
    window.exportProbe = { texts: [], svgs: [], outputs: [], urls: [], revoked: [] };
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      window.exportProbe.texts.push(text);
      if (maxWidth == null) fill.call(this, text, x, y);
      else fill.call(this, text, x, y, maxWidth);
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      if (args[0] instanceof HTMLImageElement && args[0].src.startsWith("data:image/svg+xml")) window.exportProbe.svgs.push(args[0].src);
      Reflect.apply(draw, this, args);
    };
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      window.exportProbe.outputs.push(this);
      toBlob.apply(this, args);
    };
    const createUrl = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      const url = createUrl(blob);
      window.exportProbe.urls.push(url);
      return url;
    };
    const revokeUrl = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => { window.exportProbe.revoked.push(url); revokeUrl(url); };
  });
});

async function downloadChart(page: Page, panel: Locator, path: string) {
  await page.evaluate(() => { window.exportProbe.texts = []; window.exportProbe.svgs = []; });
  const action = panel.getByRole("button", { name: "下载图表", exact: true });
  await expect(action).toBeEnabled();
  const pending = page.waitForEvent("download");
  await action.click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  expect(width).toBeLessThanOrEqual(4096);
  expect(height).toBeLessThanOrEqual(4096);
  expect(width * height).toBeLessThanOrEqual(4_000_000);
  expect(width).toBeGreaterThanOrEqual(760);
  const coloredPixels = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 40) {
      if (Math.max(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) - Math.min(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) > 30) count++;
    }
    canvas.width = canvas.height = 0;
    return count;
  }, `data:image/png;base64,${bytes.toString("base64")}`);
  expect(coloredPixels).toBeGreaterThan(100);
  await download.saveAs(path);
  await expect(action).toBeEnabled();
  expect(await page.evaluate(() => window.exportProbe.outputs.every((canvas) => canvas.width === 0 && canvas.height === 0))).toBe(true);
  const texts = await page.evaluate(() => window.exportProbe.texts.join("\n"));
  expect(texts).toContain(await panel.locator("h3").innerText());
  expect(texts).toContain("国家统计局");
  expect(texts).toContain("以官方发布为准");
  return texts;
}

test("every chart exports a nonblank bounded PNG with selected context and source", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const sections = [
    ["overview", "?period=2026-08", 5],
    ["history", "?section=history", 2],
    ["cities", "?section=cities&city=北京&cities=北京,上海,广州,深圳,杭州&indexStart=2021-08&indexEnd=2026-08", 2],
  ] as const;
  for (const [section, query, count] of sections) {
    await page.goto(`/${query}`);
    await expect(page.getByRole("button", { name: "下载图表", exact: true })).toHaveCount(count);
    if (section === "cities") await expect(page.locator(".interval-index-chart .chart-canvas svg")).toBeVisible();
    for (const [index, button] of (await page.getByRole("button", { name: "下载图表", exact: true }).all()).entries()) {
      const panel = button.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' chart-block ')][1]");
      const texts = await downloadChart(page, panel, `/tmp/house-export-${section}-${index}-${testInfo.project.name}.png`);
      expect(texts).toContain("二手住宅");
      expect(texts).toContain(section === "overview" ? "2026年8月" : "2026-08");
      if (section === "cities") {
        expect(texts).toContain("北京、上海、广州、深圳、杭州");
        expect(texts).toContain("2021-08");
        const svg = await page.evaluate(async () => (await fetch(window.exportProbe.svgs.at(-1)!)).text());
        for (const city of ["北京", "上海", "广州", "深圳", "杭州"]) expect(svg).toContain(city);
      }
    }
  }
});

test("mobile exports occupy a 44px title action without colliding with filters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile title actions only");
  await page.goto("/");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ["月度概览", "历史趋势", "城市看板"]) {
      await page.getByRole("navigation").getByRole("link", { name: section }).click();
      await expect(page.locator(".mobile-chart-download").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /全屏查看|重置视图/ })).toHaveCount(0);
      const layouts = await page.locator(".export-chart-heading").evaluateAll((headings) => headings.map((heading) => {
        const action = heading.querySelector(".mobile-chart-download")!.getBoundingClientRect();
        const title = heading.querySelector("h3")!.getBoundingClientRect();
        return {
          width: action.width, height: action.height, right: action.right,
          centered: Math.abs(action.y + action.height / 2 - title.y - title.height / 2),
          overlaps: [...heading.children].filter((child) => !child.classList.contains("mobile-chart-download")).some((child) => {
            const box = child.getBoundingClientRect();
            return Math.min(action.right, box.right) - Math.max(action.left, box.left) > 0.5 && Math.min(action.bottom, box.bottom) - Math.max(action.top, box.top) > 0.5;
          }),
        };
      }));
      for (const layout of layouts) {
        expect(layout.width).toBe(44);
        expect(layout.height).toBe(44);
        expect(layout.right).toBeLessThanOrEqual(width);
        expect(layout.centered).toBeLessThanOrEqual(1);
        expect(layout.overlaps).toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `/tmp/house-mobile-export-${width}-${section}.png` });
    }
  }
});

test("failed PNG generation can retry and repeated taps generate only one download", async ({ page }, testInfo) => {
  await page.goto("/");
  const panel = page.locator(".compact-chart").first();
  await expect(panel.locator(".chart-canvas svg")).toBeVisible();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let first = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (first) { first = false; callback(null); }
      else original.call(this, callback, ...args);
    };
  });
  const button = panel.getByRole("button", { name: "下载图表" });
  await button.click();
  await expect(panel.getByRole("alert")).toHaveText("图片生成失败，请重试。");
  await expect(button).toBeEnabled();
  let downloads = 0;
  page.on("download", () => downloads++);
  const pending = page.waitForEvent("download");
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await pending;
  await expect(button).toBeEnabled();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(downloads).toBe(1);
  await page.clock.install();
  // Newly scheduled downloads are checked under the controlled clock.
  await downloadChart(page, panel, `/tmp/house-export-retry-${testInfo.project.name}.png`);
  const url = await page.evaluate(() => window.exportProbe.urls.at(-1)!);
  await page.clock.fastForward(31_000);
  expect(await page.evaluate((url) => window.exportProbe.revoked.includes(url), url)).toBe(true);
});

test("index exports retain flat-fill caveats and all missing month ranges", async ({ page }, testInfo) => {
  await page.goto("/?section=cities&city=北京&indexStart=2016-01&indexEnd=2026-08");
  const panel = page.locator(".interval-index-chart");
  await expect(panel.locator(".interval-fill-note")).toBeVisible();
  const text = await downloadChart(page, panel, `/tmp/house-export-estimate-${testInfo.project.name}.png`);
  expect(text).toContain("含持平填补");
  expect(text).toContain("非官方定基指数");
  expect(text).toContain("终点指数");
  expect(text).toContain("区间累计涨跌");
  expect(text).toContain("缺失");
  expect(text).toContain("后续累计值均含填补假设");
});
