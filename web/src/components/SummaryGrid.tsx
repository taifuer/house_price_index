import type { CityDatum, Manifest } from "../types";
import { formatPct } from "../lib/format";

interface SummaryGridProps {
  data: CityDatum[];
  manifest: Manifest;
}

export function SummaryGrid({ data, manifest }: SummaryGridProps) {
  const changes = data.map((item) => item.change).sort((left, right) => left - right);
  const mean = changes.reduce((total, value) => total + value, 0) / changes.length;
  const middle = Math.floor(changes.length / 2);
  const median =
    changes.length % 2 === 0
      ? ((changes[middle - 1] ?? 0) + (changes[middle] ?? 0)) / 2
      : (changes[middle] ?? 0);
  const items = [
    ["覆盖城市", `${data.length}/${manifest.cities.length}`],
    ["上涨", String(changes.filter((value) => value > 0).length)],
    ["持平", String(changes.filter((value) => value === 0).length)],
    ["下跌", String(changes.filter((value) => value < 0).length)],
    ["等权均值", formatPct(mean)],
    ["中位数", formatPct(median)],
    ["区间", `[${formatPct(changes[0] ?? 0)}, ${formatPct(changes.at(-1) ?? 0)}]`],
  ];
  const coveredCities = new Set(data.map((item) => item.city));
  const missingCities = manifest.cities.filter((city) => !coveredCities.has(city.name)).map((city) => city.name);

  return (
    <>
      <div className="summary-grid">
        {items.map(([label, value]) => (
          <div className="summary-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className={`summary-context${missingCities.length ? " has-warning" : ""}`}>
        {missingCities.length
          ? `本期缺少 ${missingCities.length} 城：${missingCities.join("、")}。`
          : "本期 70 城数据完整。"}
        {" 均值为覆盖城市等权描述；指数涨跌幅不代表城市绝对房价水平。"}
      </p>
    </>
  );
}
