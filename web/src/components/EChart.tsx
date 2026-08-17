import { useEffect, useRef } from "react";
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
import { Camera, Maximize2, RotateCcw } from "lucide-react";

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
  fileName: string;
  showReset?: boolean;
  className?: string;
}

export function EChart({ option, height, ariaLabel, fileName, showReset = false, className = "" }: EChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const chart = echarts.init(canvasRef.current, undefined, { renderer: "svg" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(canvasRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  const download = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const anchor = document.createElement("a");
    anchor.href = chart.getDataURL({ type: "svg", backgroundColor: "#ffffff" });
    anchor.download = `${fileName}.svg`;
    anchor.click();
  };

  const enterFullscreen = async () => {
    if (!wrapperRef.current?.requestFullscreen) return;
    await wrapperRef.current.requestFullscreen();
    requestAnimationFrame(() => chartRef.current?.resize());
  };

  const reset = () => chartRef.current?.setOption(optionRef.current, { notMerge: true });

  return (
    <div ref={wrapperRef} className={`chart-shell ${className}`.trim()}>
      <div className="chart-actions" aria-label="图表操作">
        {showReset && (
          <button type="button" onClick={reset} title="重置视图" aria-label="重置视图">
            <RotateCcw size={16} strokeWidth={1.8} />
          </button>
        )}
        <button type="button" onClick={download} title="下载图表" aria-label="下载图表">
          <Camera size={16} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={enterFullscreen} title="全屏查看" aria-label="全屏查看">
          <Maximize2 size={16} strokeWidth={1.8} />
        </button>
      </div>
      <div
        ref={canvasRef}
        className="chart-canvas"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  );
}
