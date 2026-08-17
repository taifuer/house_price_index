import type { CityDatum } from "../types";
import { formatPct } from "../lib/format";

interface SummaryGridProps {
  data: CityDatum[];
}

export function SummaryGrid({ data }: SummaryGridProps) {
  const changes = data.map((item) => item.change).sort((left, right) => left - right);
  const mean = changes.reduce((total, value) => total + value, 0) / changes.length;
  const middle = Math.floor(changes.length / 2);
  const median =
    changes.length % 2 === 0
      ? ((changes[middle - 1] ?? 0) + (changes[middle] ?? 0)) / 2
      : (changes[middle] ?? 0);
  const items = [
    ["覆盖城市", String(data.length)],
    ["上涨", String(changes.filter((value) => value > 0).length)],
    ["持平", String(changes.filter((value) => value === 0).length)],
    ["下降", String(changes.filter((value) => value < 0).length)],
    ["均值", formatPct(mean)],
    ["中位数", formatPct(median)],
    ["区间", `${formatPct(changes[0] ?? 0)} ~ ${formatPct(changes.at(-1) ?? 0)}`],
  ];

  return (
    <div className="summary-grid">
      {items.map(([label, value]) => (
        <div className="summary-item" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
