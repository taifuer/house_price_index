import { formatPeriod } from "../lib/format";
import { FilterSelect } from "./FilterSelect";

export function MonthSelect({ periods, value, onChange, label }: {
  periods: string[]; value: string; onChange: (period: string) => void; label: string;
}) {
  return <FilterSelect variant="inline" className="month-select" aria-label={label} value={value}
    onChange={(event) => onChange(event.target.value)} disabled={!periods.length}>
    {[...periods].reverse().map((period) => <option key={period} value={period}>{formatPeriod(period)}</option>)}
  </FilterSelect>;
}
