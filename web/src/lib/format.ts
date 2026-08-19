import type { TrendRange } from "../types";

export function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function formatPct(value: number): string {
  const rounded = roundOne(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

export function formatMetric(metric: string): string {
  return metric === "累计平均" ? "累计平均同比" : metric;
}

export function metricAxisName(metric: string): string {
  return `${formatMetric(metric)}涨跌幅（%）`;
}

export function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  return year && month ? `${year}年${Number(month)}月` : period;
}

export function formatSizeBand(sizeBand: string): string {
  return sizeBand.replace("m2", "m²");
}

export function completeMonths(start: string, end: string): string[] {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return [];

  const periods: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return periods;
}

export function periodsForRange(periods: string[], range: TrendRange): string[] {
  const monthsByRange: Record<Exclude<TrendRange, "all">, number> = {
    "3y": 36,
    "5y": 60,
    "10y": 120,
  };
  if (range === "all") return periods;
  return periods.slice(-monthsByRange[range]);
}

export function summarizePeriodRanges(periods: string[]): string {
  const ordered = [...new Set(periods)].sort();
  if (ordered.length === 0) return "";

  const periodNumber = (period: string) => {
    const [year = 0, month = 0] = period.split("-").map(Number);
    return year * 12 + month;
  };
  const ranges: Array<[string, string]> = [];
  let start = ordered[0]!;
  let previous = start;
  for (const current of ordered.slice(1)) {
    if (periodNumber(current) === periodNumber(previous) + 1) {
      previous = current;
      continue;
    }
    ranges.push([start, previous]);
    start = current;
    previous = current;
  }
  ranges.push([start, previous]);

  const labels = ranges.map(([rangeStart, rangeEnd]) =>
    rangeStart === rangeEnd
      ? formatPeriod(rangeStart)
      : `${formatPeriod(rangeStart)} 至 ${formatPeriod(rangeEnd)}`,
  );
  return labels.length > 3 ? `${labels.slice(0, 3).join("、")} 等` : labels.join("、");
}
