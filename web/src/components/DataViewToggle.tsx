import { ChartNoAxesColumn, Table2 } from "lucide-react";

export type DataView = "chart" | "data";

interface DataViewToggleProps {
  value: DataView;
  onChange: (value: DataView) => void;
  label: string;
}

export function DataViewToggle({ value, onChange, label }: DataViewToggleProps) {
  return (
    <div className="segmented data-view-toggle" role="group" aria-label={label}>
      <button type="button" title="统计图" aria-label="统计图" aria-pressed={value === "chart"} className={value === "chart" ? "is-active" : ""} onClick={() => onChange("chart")}>
        <ChartNoAxesColumn size={14} aria-hidden="true" />图
      </button>
      <button type="button" title="数据表" aria-label="数据表" aria-pressed={value === "data"} className={value === "data" ? "is-active" : ""} onClick={() => onChange("data")}>
        <Table2 size={14} aria-hidden="true" />表
      </button>
    </div>
  );
}
