import { formatPct } from "./format";

export const CITY_TIERS = ["一线", "二线", "三线"] as const;
export const HEATMAP_PALETTE = ["#91b6e9", "#d8e5f7", "#f2f4f7", "#f9d9da", "#eea0a3"];

// Fixed, clipped colour domains keep months and tiers comparable; values are never clipped.
export function heatmapLimit(metric: string): number {
  return metric === "环比" ? 1 : 10;
}

export function heatmapColor(value: number | null, metric: string): string {
  if (value == null) return "#ffffff";
  const position = (Math.max(-1, Math.min(1, value / heatmapLimit(metric))) + 1) * 2;
  const index = Math.min(3, Math.floor(position));
  const amount = position - index;
  const channels = [1, 3, 5].map((offset) => {
    const start = Number.parseInt(HEATMAP_PALETTE[index]!.slice(offset, offset + 2), 16);
    const end = Number.parseInt(HEATMAP_PALETTE[index + 1]!.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * amount);
  });
  return `rgb(${channels.join(", ")})`;
}

export function heatmapLegendLabels(metric: string): string[] {
  const limit = heatmapLimit(metric);
  return [`≤ ${formatPct(-limit)}`, "0.0%", `≥ ${formatPct(limit)}`];
}

export function heatmapHeight(cityCount: number, isMobile: boolean): number {
  return Math.max(220, cityCount * (isMobile ? 24 : 21) + 154);
}
