import { Search, SlidersHorizontal } from "lucide-react";
import { DASHBOARD_SECTIONS } from "../lib/dashboardState";
import type { DashboardSection } from "../types";

interface AppHeaderProps {
  title: string;
  filterOpen: boolean;
  activeFilterCount: number;
  onToggleFilter: () => void;
  section: DashboardSection;
  sectionHref: (section: DashboardSection) => string;
  onSectionChange: (section: DashboardSection) => void;
  searchOpen: boolean;
  onOpenSearch: () => void;
}

export function AppHeader({ title, filterOpen, activeFilterCount, onToggleFilter, section, sectionHref, onSectionChange, searchOpen, onOpenSearch }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <h1 className="app-title">
          <a href="/">{title}</a>
        </h1>
        <nav className="task-navigation" aria-label="数据视图">
          {DASHBOARD_SECTIONS.map((item) => (
            <a
              key={item.value}
              href={sectionHref(item.value)}
              aria-current={section === item.value ? "page" : undefined}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onSectionChange(item.value);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-tools">
          <button type="button" className="header-tool search-toggle" onClick={onOpenSearch}
            title="搜索城市" aria-label="搜索城市" aria-controls="city-search-dialog" aria-haspopup="dialog" aria-expanded={searchOpen}>
            <Search size={19} />
          </button>
          <button
          type="button"
          className={`header-tool filter-toggle${filterOpen || activeFilterCount ? " is-active" : ""}`}
          onClick={onToggleFilter}
          title={filterOpen ? "关闭筛选" : "打开筛选"}
          aria-label={`${filterOpen ? "关闭" : "打开"}筛选${activeFilterCount ? `，${activeFilterCount} 项非默认筛选` : ""}`}
          aria-controls="filter-drawer"
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
        >
          <SlidersHorizontal size={19} />
          {activeFilterCount > 0 && <span className="filter-count" aria-label={`${activeFilterCount} 项非默认筛选`} />}
          </button>
        </div>
      </div>
    </header>
  );
}
