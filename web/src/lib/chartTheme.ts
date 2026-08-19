export const COLORS = {
  up: "#e5484d",
  upSoft: "#fca5a5",
  down: "#3478d4",
  downSoft: "#a8c7f0",
  flat: "#98a2b3",
  baseline: "#667085",
  grid: "#e5e7eb",
  text: "#111827",
  muted: "#667085",
  missing: "#d0d5dd",
  selection: "#2563eb",
} as const;

function parseHex(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

function mixColor(start: string, end: string, amount: number): string {
  const left = parseHex(start);
  const right = parseHex(end);
  const channel = (index: number) => Math.round(left[index]! + (right[index]! - left[index]!) * amount);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export function changeColor(value: number, maximum: number): string {
  if (value === 0) return COLORS.missing;
  const intensity = Math.min(Math.abs(value) / Math.max(maximum, 0.1), 1);
  return value > 0
    ? mixColor(COLORS.upSoft, COLORS.up, intensity)
    : mixColor(COLORS.downSoft, COLORS.down, intensity);
}

export function firstPeriodByYear(periods: string[]): Set<string> {
  const first = new Set<string>();
  const seen = new Set<string>();
  for (const period of periods) {
    const year = period.slice(0, 4);
    if (!seen.has(year)) {
      first.add(period);
      seen.add(year);
    }
  }
  return first;
}

export interface SymmetricScale {
  minimum: number;
  maximum: number;
  interval: number;
}

export function symmetricScale(values: number[], minimumAbsolute: number): SymmetricScale {
  const maximumAbsolute = Math.max(minimumAbsolute, ...values.map((value) => Math.abs(value)));
  const paddedMaximum = maximumAbsolute * 1.05;
  const roughInterval = paddedMaximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughInterval));
  const normalizedInterval = roughInterval / magnitude;
  const niceFactor = [1, 2, 5, 10].find((factor) => factor >= normalizedInterval) ?? 10;
  const interval = Number((niceFactor * magnitude).toPrecision(12));
  const maximum = Number((Math.ceil(paddedMaximum / interval) * interval).toPrecision(12));
  return { minimum: -maximum, maximum, interval };
}

export const axisLineStyle = { color: "#cbd5e1" };
export const splitLineStyle = { color: COLORS.grid, width: 1 };
export const axisLabelStyle = { color: COLORS.muted, fontSize: 11 };
