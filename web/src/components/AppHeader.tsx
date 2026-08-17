import { SlidersHorizontal } from "lucide-react";

interface AppHeaderProps {
  title: string;
  filterOpen: boolean;
  activeFilterCount: number;
  onToggleFilter: () => void;
}

export function AppHeader({ title, filterOpen, activeFilterCount, onToggleFilter }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <h1 className="app-title">
          <a href="/">{title}</a>
        </h1>
        <button
          type="button"
          className={`filter-toggle${filterOpen || activeFilterCount ? " is-active" : ""}`}
          onClick={onToggleFilter}
          title={filterOpen ? "关闭筛选" : "打开筛选"}
          aria-label={`${filterOpen ? "关闭" : "打开"}筛选${activeFilterCount ? `，${activeFilterCount} 项非默认筛选` : ""}`}
          aria-controls="filter-drawer"
          aria-expanded={filterOpen}
        >
          <SlidersHorizontal size={17} />
          <span className="filter-toggle-label">筛选</span>
          {activeFilterCount > 0 && <span className="filter-count" aria-label={`${activeFilterCount} 项非默认筛选`}>{activeFilterCount}</span>}
        </button>
      </div>
    </header>
  );
}
