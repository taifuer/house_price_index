import { CityPicker } from "./CityPicker";
import { FilterSelect } from "./FilterSelect";
import { Segmented } from "./Segmented";
import { completeMonths, formatPeriod } from "../lib/format";
import { intervalStartForRange, MAX_INTERVAL_CITIES, type IntervalSelection } from "../lib/intervalIndex";
import type { DatasetDescriptor, Manifest, TrendRange } from "../types";

const ranges: { value: TrendRange; label: string }[] = [
  { value: "all", label: "全部" }, { value: "3y", label: "近3年" },
  { value: "5y", label: "近5年" }, { value: "10y", label: "近10年" },
];

export function CityHistoryControls({ manifest, descriptor, primaryCity, selection, colors, onHouseChange, onChange }: {
  manifest: Manifest;
  descriptor: DatasetDescriptor;
  primaryCity: string;
  selection: IntervalSelection;
  colors: ReadonlyMap<string, string>;
  onHouseChange: (house: string) => void;
  onChange: (selection: IntervalSelection) => void;
}) {
  const periods = completeMonths(descriptor.periods[0]!, descriptor.periods.at(-1)!);
  const active = ranges.find((range) => intervalStartForRange(periods[0]!, selection.end, range.value) === selection.start)?.value ?? "";
  return <div className="city-history-controls" role="group" aria-label="城市历史筛选">
    <div className="city-history-filters">
      <label className="history-house-filter"><span>住宅类型</span>
        <FilterSelect aria-label="城市历史住宅类型" value={descriptor.houseType} onChange={(event) => onHouseChange(event.target.value)}>
          {manifest.dimensions.houseTypes.map((house) => <option key={house} value={house}>{house}</option>)}
        </FilterSelect>
      </label>
      <div className="interval-range-controls">
        <div className="interval-controls">
          <label><span>起始月份</span><FilterSelect aria-label="起始月份" value={selection.start} onChange={(event) => onChange({ ...selection, start: event.target.value })}>
            {periods.map((period) => <option key={period} value={period} disabled={period > selection.end}>{formatPeriod(period)}</option>)}
          </FilterSelect></label>
          <label><span>结束月份</span><FilterSelect aria-label="结束月份" value={selection.end} onChange={(event) => onChange({ ...selection, end: event.target.value })}>
            {periods.map((period) => <option key={period} value={period} disabled={period < selection.start}>{formatPeriod(period)}</option>)}
          </FilterSelect></label>
        </div>
        <Segmented<TrendRange | ""> label="城市历史时间范围" value={active} options={ranges}
          onChange={(range) => { if (range) onChange({ ...selection, start: intervalStartForRange(periods[0]!, selection.end, range) }); }} />
      </div>
    </div>
    <CityPicker cities={manifest.cities} selected={selection.cities} colors={colors} primaryCity={primaryCity}
      maxSelected={MAX_INTERVAL_CITIES} label="城市对比选择" onChange={(cities) => onChange({ ...selection, cities })} />
  </div>;
}
