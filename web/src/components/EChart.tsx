import { useEffect, useRef, useState } from "react";
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
import { Download, Maximize2, Minimize2, RotateCcw } from "lucide-react";

import { useMediaQuery } from "../hooks/useMediaQuery";

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
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
      requestAnimationFrame(() => chartRef.current?.resize());
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const download = async () => {
    const chart = chartRef.current;
    if (!chart) return;
    const width = chart.getWidth();
    const height = chart.getHeight();
    const image = new Image();
    const source = chart.getDataURL({ backgroundColor: "#ffffff" });
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("图表图像生成失败"));
        image.src = source;
      });
    } catch {
      return;
    }

    // The SVG renderer ignores getDataURL({ type: "png" }), so rasterize explicitly.
    const pixelRatio = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(pixelRatio, pixelRatio);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const anchor = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    anchor.href = objectUrl;
    anchor.download = `${fileName}.png`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

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
          <button type="button" onClick={() => void download()} title="下载图表" aria-label="下载图表">
            <Download size={16} strokeWidth={1.8} />
          </button>
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
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  );
}
