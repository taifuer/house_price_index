import { useCallback, useEffect, useRef } from "react";
import { RotateCcw, X } from "lucide-react";

import type { Manifest } from "../types";
import { formatPeriod, formatSizeBand } from "../lib/format";

export interface FilterSelection {
  period: string;
  houseType: string;
  sizeBand: string;
  metric: string;
}

interface FilterDrawerProps {
  manifest: Manifest;
  selection: FilterSelection;
  periods: string[];
  open: boolean;
  onClose: () => void;
  onReset: () => void;
  onSelectionChange: (next: Partial<FilterSelection>) => void;
}

export function FilterDrawer({
  manifest,
  selection,
  periods,
  open,
  onClose,
  onReset,
  onSelectionChange,
}: FilterDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const firstControlRef = useRef<HTMLSelectElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    onCloseRef.current();
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".filter-toggle")?.focus();
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstControlRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = drawerRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex='-1'])",
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, requestClose]);

  return (
    <>
      <button
        type="button"
        className={`filter-backdrop${open ? " is-visible" : ""}`}
        onClick={requestClose}
        aria-label="关闭筛选"
        tabIndex={-1}
      />
      <aside
        ref={drawerRef}
        id="filter-drawer"
        className={`filter-drawer${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="filter-drawer-heading">
          <h2 id="filter-drawer-title">筛选条件</h2>
          <button type="button" className="icon-button" onClick={requestClose} title="关闭筛选" aria-label="关闭筛选">
            <X size={20} />
          </button>
        </div>

        <div className="filter-drawer-body">
          <div className="filter-list">
            <label>
              <span>月份</span>
              <select
                ref={firstControlRef}
                value={selection.period}
                onChange={(event) => onSelectionChange({ period: event.target.value })}
              >
                {[...periods].reverse().map((period) => (
                  <option key={period} value={period}>
                    {formatPeriod(period)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>住宅类型</span>
              <select
                value={selection.houseType}
                onChange={(event) => onSelectionChange({ houseType: event.target.value })}
              >
                {manifest.dimensions.houseTypes.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>面积段</span>
              <select
                value={selection.sizeBand}
                onChange={(event) => onSelectionChange({ sizeBand: event.target.value })}
              >
                {manifest.dimensions.sizeBands.map((value) => (
                  <option key={value} value={value}>{formatSizeBand(value)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>指标</span>
              <select
                value={selection.metric}
                onChange={(event) => onSelectionChange({ metric: event.target.value })}
              >
                {manifest.dimensions.metrics.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="filter-details">
            <details>
              <summary>数据范围</summary>
              <p>70 城：{formatPeriod(manifest.periodRange[0])} 至 {formatPeriod(manifest.periodRange[1])}</p>
              <p>共 {manifest.recordCount.toLocaleString("zh-CN")} 条有效观测。</p>
            </details>
            <details>
              <summary>指标说明</summary>
              <p>环比：上月 = 100</p>
              <p>同比：上年同月 = 100</p>
              <p>累计平均：上年同期 = 100</p>
              <p>图中变动值 = 指数 - 100</p>
            </details>
          </div>
        </div>

        <div className="filter-drawer-footer">
          <button type="button" className="filter-reset" onClick={onReset}>
            <RotateCcw size={16} />
            恢复默认
          </button>
          <button type="button" className="filter-done" onClick={requestClose}>完成</button>
        </div>
      </aside>
    </>
  );
}
