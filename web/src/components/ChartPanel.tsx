import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { chartPng, downloadPng, type ChartExportInfo, type ChartGraphic, type ChartRenderer } from "../lib/chartExport";

interface ExportContext {
  register: (renderer: ChartRenderer | null) => void;
  download: () => Promise<void>;
  ready: boolean;
  busy: boolean;
}

const ChartExportContext = createContext<ExportContext | null>(null);

function useChartExport() {
  const context = useContext(ChartExportContext);
  if (!context) throw new Error("Chart export requires a ChartPanel");
  return context;
}

export function useChartExportRenderer(renderer: ChartRenderer) {
  const { register } = useChartExport();
  const current = useRef(renderer);
  current.current = renderer;
  useEffect(() => {
    register(() => current.current());
    return () => register(null);
  }, [register]);
}

export function ChartDownloadButton({ className = "" }: { className?: string }) {
  const { download, busy, ready } = useChartExport();
  return <button type="button" className={className} onClick={() => void download()} disabled={!ready || busy}
    aria-label="下载图表" title={busy ? "正在生成图片" : "下载图表（PNG）"} aria-busy={busy}>
    {busy ? <LoaderCircle size={17} strokeWidth={1.8} className="export-spinner" /> : <Download size={17} strokeWidth={1.8} />}
  </button>;
}

interface ChartPanelProps extends ChartExportInfo {
  className?: string;
  headingClassName?: string;
  headingContent?: ReactNode;
  fileName: string;
  children: ReactNode;
}

export function ChartPanel({ className = "", headingClassName = "", headingContent, fileName, children, ...info }: ChartPanelProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const renderer = useRef<ChartRenderer | null>(null);
  const working = useRef(false);
  const mounted = useRef(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const register = useCallback((value: ChartRenderer | null) => {
    renderer.current = value;
    setReady(value !== null);
  }, []);
  const download = async () => {
    if (!renderer.current || working.current) return;
    working.current = true;
    setBusy(true);
    setError(false);
    let graphic: ChartGraphic | undefined;
    try {
      graphic = await renderer.current();
      const blob = await chartPng(graphic, info);
      if (mounted.current) downloadPng(blob, fileName);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (graphic?.source instanceof HTMLCanvasElement) graphic.source.width = graphic.source.height = 0;
      else if (graphic) graphic.source.removeAttribute("src");
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <ChartExportContext.Provider value={{ register, ready, busy, download }}>
    <div className={`chart-block ${className}`.trim()}>
      <div className={`chart-heading-row export-chart-heading ${headingClassName}`.trim()}>
        <h3>{info.title}</h3>
        {headingContent}
        {isMobile && <ChartDownloadButton className="mobile-chart-download" />}
      </div>
      {children}
      {error && <p className="chart-export-error" role="alert">图片生成失败，请重试。</p>}
    </div>
  </ChartExportContext.Provider>;
}
