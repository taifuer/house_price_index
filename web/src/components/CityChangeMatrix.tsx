import { useRef, useState } from "react";
import { Download } from "lucide-react";

import { useMediaQuery } from "../hooks/useMediaQuery";
import { CITY_TIERS, heatmapColor, heatmapLegendLabels, heatmapLimit } from "../lib/cityHeatmap";
import { formatPct } from "../lib/format";
import type { Observation } from "../lib/observations";
import { HeatmapLegend } from "./HeatmapLegend";

interface CityChangeMatrixProps {
  rows: Observation[];
  metric: string;
  filePrefix: string;
  onViewCity: (city: string) => void;
}

export function CityChangeMatrix({ rows, metric, filePrefix, onViewCity }: CityChangeMatrixProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const matrixRef = useRef<HTMLDivElement>(null);
  const [downloadError, setDownloadError] = useState(false);
  const groups = CITY_TIERS.map((tier) => ({ tier, cities: rows.filter((row) => row.tier === tier) }))
    .filter((group) => group.cities.length);

  const download = async () => {
    setDownloadError(false);
    try {
      await document.fonts.ready;
      const grid = matrixRef.current?.querySelector(".city-matrix-grid");
      if (!grid) return;
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      const width = 1200;
      const gap = 6;
      const cellWidth = (width - 48 - gap * (columns - 1)) / columns;
      const height = 118 + groups.reduce((sum, group) => sum + 38 + Math.ceil(group.cities.length / columns) * 62, 0);
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.scale(2, 2);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#111827";
      context.font = "600 20px sans-serif";
      context.fillText("城市涨跌", 24, 32);
      context.font = "13px sans-serif";
      context.fillText(filePrefix, 24, 56);
      let y = 72;
      for (const group of groups) {
        context.fillStyle = "#475467";
        context.font = "600 14px sans-serif";
        context.fillText(`${group.tier} · ${group.cities.length}城`, 24, y + 20);
        y += 32;
        group.cities.forEach((row, index) => {
          const x = 24 + (index % columns) * (cellWidth + gap);
          const top = y + Math.floor(index / columns) * 62;
          context.fillStyle = heatmapColor(row.change, metric);
          context.fillRect(x, top, cellWidth, 56);
          if (row.change == null) {
            context.strokeStyle = "#98a2b3";
            context.setLineDash([3, 3]);
            context.strokeRect(x + 0.5, top + 0.5, cellWidth - 1, 55);
            context.setLineDash([]);
          }
          context.fillStyle = "#17212f";
          context.textAlign = "center";
          context.font = "13px sans-serif";
          context.fillText(row.city, x + cellWidth / 2, top + 21);
          context.font = "600 14px sans-serif";
          context.fillText(row.change == null ? "—" : formatPct(row.change), x + cellWidth / 2, top + 43);
          context.textAlign = "start";
        });
        y += Math.ceil(group.cities.length / columns) * 62 + 6;
      }
      const legendWidth = 220;
      for (let x = 0; x < legendWidth; x++) {
        const limit = heatmapLimit(metric);
        context.fillStyle = heatmapColor((x / (legendWidth - 1) * 2 - 1) * limit, metric);
        context.fillRect(24 + x, y + 4, 1, 8);
      }
      context.fillStyle = "#475467";
      context.font = "12px sans-serif";
      heatmapLegendLabels(metric).forEach((label, index) => {
        context.textAlign = index === 0 ? "left" : index === 1 ? "center" : "right";
        context.fillText(label, 24 + index * legendWidth / 2, y + 29);
      });
      context.textAlign = "left";
      context.fillText("— 缺失", 270, y + 29);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG unavailable");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filePrefix}-城市涨跌.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    }
  };

  return (
    <div className="city-matrix" ref={matrixRef}>
      {!isMobile && (
        <div className="chart-actions" aria-label="图表操作">
          <button type="button" className="matrix-download" title="下载图表" aria-label="下载图表" onClick={() => void download()}><Download size={16} /></button>
        </div>
      )}
      {groups.map(({ tier, cities }) => (
        <section className="city-matrix-tier" key={tier} aria-label={`${tier}城市涨跌`}>
          <h4>{tier}<span>{cities.length}城</span></h4>
          <div className="city-matrix-grid">
            {cities.map((row) => (
              <button
                key={row.city}
                type="button"
                className={`city-matrix-cell${row.change == null ? " is-missing" : ""}`}
                style={{ backgroundColor: heatmapColor(row.change, metric) }}
                aria-label={`${row.city}，${row.change == null ? "缺失" : `${metric} ${formatPct(row.change)}`}，查看走势`}
                onClick={() => onViewCity(row.city)}
              >
                <span>{row.city}</span>
                <strong>{row.change == null ? "—" : formatPct(row.change)}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}
      <div className="city-matrix-footer">
        <HeatmapLegend metric={metric} />
      </div>
      {downloadError && <p role="alert" className="trend-note">图表下载失败，请重试。</p>}
    </div>
  );
}
