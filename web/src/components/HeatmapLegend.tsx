import { HEATMAP_PALETTE, heatmapLegendLabels } from "../lib/cityHeatmap";

export function HeatmapLegend({ metric }: { metric: string }) {
  return (
    <div className="heatmap-legend" aria-label={`${metric}涨跌幅色标`}>
      <div className="heatmap-scale">
        <div className="heatmap-scale-bar" style={{ background: `linear-gradient(to right, ${HEATMAP_PALETTE.join(", ")})` }} />
        <div className="heatmap-scale-labels">{heatmapLegendLabels(metric).map((label) => <span key={label}>{label}</span>)}</div>
      </div>
      <span className="heatmap-missing-key"><i aria-hidden="true" />缺失</span>
    </div>
  );
}
