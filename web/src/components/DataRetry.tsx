import { RefreshCw } from "lucide-react";

export function DataRetry({ message, onRetry, busy = false, className = "" }: {
  message: string; onRetry: () => void; busy?: boolean; className?: string;
}) {
  return <div className={`data-error data-retry ${className}`} role={busy ? "status" : "alert"}>
    <span>{busy ? "正在重新加载数据…" : message}</span>
    <button type="button" className="retry-button" onClick={onRetry} disabled={busy}
      aria-label="重新加载数据" title="重新加载数据"><RefreshCw size={16} className={busy ? "is-spinning" : ""} /></button>
  </div>;
}
