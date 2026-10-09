import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BarChart, CustomChart, LineChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";

import { useMediaQuery } from "../hooks/useMediaQuery";
import { loadExportImage } from "../lib/chartExport";
import { ChartDownloadButton, useChartExportRenderer } from "./ChartPanel";

echarts.use([
  AriaComponent,
  BarChart,
  CustomChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  LineChart,
  MarkLineComponent,
  ScatterChart,
  SVGRenderer,
  TitleComponent,
  TooltipComponent,
]);

interface EChartProps {
  option: EChartsCoreOption;
  height: number;
  ariaLabel: string;
  showReset?: boolean;
  className?: string;
  group?: string;
  periodInteraction?: { periods: string[]; selected: string; onSelect: (period: string) => void };
}

export function EChart({ option, height, ariaLabel, showReset = false, className = "", group, periodInteraction }: EChartProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const updateMarkerRef = useRef<() => void>(() => {});
  const chartRef = useRef<EChartsType | null>(null);
  const chartReadyRef = useRef(false);
  const optionRef = useRef(option);
  optionRef.current = option;
  const interactionRef = useRef(periodInteraction);
  interactionRef.current = periodInteraction;

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const chart = echarts.init(canvasRef.current, undefined, { renderer: "svg" });
    chartRef.current = chart;
    // Updating an inspection marker must not reset the chart's tooltip or legend state.
    const updateMarker = () => {
      const marker = markerRef.current;
      const interaction = interactionRef.current;
      if (!marker || !interaction || !chartReadyRef.current) return;
      const visible = interaction.periods.includes(interaction.selected);
      const x = visible ? chart.convertToPixel({ xAxisIndex: 0 }, interaction.selected) as number : null;
      const grid = optionRef.current.grid as { top?: number; bottom?: number } | undefined;
      marker.hidden = typeof x !== "number" || !Number.isFinite(x);
      if (!marker.hidden) {
        marker.style.left = `${canvasRef.current!.offsetLeft + x!}px`;
        marker.style.top = `${canvasRef.current!.offsetTop + (grid?.top ?? 0)}px`;
        marker.style.height = `${chart.getHeight() - (grid?.top ?? 0) - (grid?.bottom ?? 0)}px`;
      }
    };
    updateMarkerRef.current = updateMarker;
    chart.on("finished", () => {
      chartReadyRef.current = true;
      updateMarker();
    });
    if (group) {
      chart.group = group;
      echarts.connect(group);
    }
    let origin: [number, number] | null = null;
    let moved = false;
    const down = (event: PointerEvent) => { origin = [event.clientX, event.clientY]; moved = false; };
    const move = (event: PointerEvent) => {
      if (origin && Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) > 8) moved = true;
    };
    const cancel = () => { moved = true; };
    const canvas = canvasRef.current;
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointercancel", cancel);
    chart.getZr().on("click", (event) => {
      const interaction = interactionRef.current;
      if (!interaction || moved || !chart.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])) return;
      const position = chart.convertFromPixel({ xAxisIndex: 0 }, event.offsetX) as number;
      const month = interaction.periods[Math.round(position)];
      if (month) interaction.onSelect(month);
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(canvasRef.current);
    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointercancel", cancel);
      chart.dispose();
      chartRef.current = null;
      chartReadyRef.current = false;
      updateMarkerRef.current = () => {};
    };
  }, [group]);

  useEffect(() => {
    chartReadyRef.current = false;
    if (markerRef.current) markerRef.current.hidden = true;
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useEffect(() => { updateMarkerRef.current(); }, [periodInteraction?.selected]);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
      requestAnimationFrame(() => chartRef.current?.resize());
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useChartExportRenderer(async () => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) throw new Error("Chart unavailable");
    const snapshot = chart.getOption();
    const width = Math.max(760, Math.min(1280, chart.getWidth()));
    // Render the complete filtered range, without changing the live zoom or hover state.
    const exportChart = echarts.init(document.createElement("div"), undefined, {
      renderer: "svg", width, height,
    });
    try {
      exportChart.setOption({
        ...snapshot,
        animation: false,
        tooltip: { show: false },
        grid: ((snapshot.grid ?? []) as Record<string, unknown>[]).map((grid) => ({
          ...grid,
          ...(typeof grid.right === "number" ? { right: Math.max(64, grid.right) } : {}),
        })),
        legend: ((snapshot.legend ?? []) as Record<string, unknown>[]).map((legend) => ({ ...legend, type: "plain" })),
        dataZoom: ((snapshot.dataZoom ?? []) as Record<string, unknown>[]).map((zoom) => ({
          ...zoom, start: 0, end: 100, startValue: undefined, endValue: undefined,
        })),
      });
      return { source: await loadExportImage(exportChart.getDataURL({ backgroundColor: "#ffffff" })), width, height };
    } finally {
      exportChart.dispose();
    }
  });

  const toggleFullscreen = async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (document.fullscreenElement === wrapper) {
      await document.exitFullscreen();
      return;
    }
    if (!wrapper.requestFullscreen) return;
    await wrapper.requestFullscreen();
  };

  const reset = () => chartRef.current?.setOption(optionRef.current, { notMerge: true });

  return (
    <div ref={wrapperRef} className={`chart-shell ${className}`.trim()}>
      {!isMobile && (
        <div className="chart-actions" aria-label="图表操作">
          {showReset && (
            <button type="button" onClick={reset} title="重置视图" aria-label="重置视图">
              <RotateCcw size={16} strokeWidth={1.8} />
            </button>
          )}
          <ChartDownloadButton />
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "退出全屏" : "全屏查看"}
            aria-label={isFullscreen ? "退出全屏" : "全屏查看"}
          >
            {isFullscreen
              ? <Minimize2 size={16} strokeWidth={1.8} />
              : <Maximize2 size={16} strokeWidth={1.8} />}
          </button>
        </div>
      )}
      <div
        ref={canvasRef}
        className="chart-canvas"
        style={{ height, "--chart-height": `${height}px` } as CSSProperties}
        role="img"
        aria-label={ariaLabel}
        data-selected-period={periodInteraction?.selected}
        data-period-start={periodInteraction?.periods[0]}
        data-period-end={periodInteraction?.periods.at(-1)}
      />
      {periodInteraction && <div ref={markerRef} className="selected-period-line" aria-hidden="true" hidden />}
    </div>
  );
}
