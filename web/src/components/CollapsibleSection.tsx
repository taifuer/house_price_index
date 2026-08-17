import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  children,
  actions,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = `section-${title.replace(/\s+/g, "-")}`;
  return (
    <section className={`collapsible-section${open ? " is-open" : ""}`}>
      <div className="section-heading">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={sectionId}
        >
          {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          <span>{title}</span>
        </button>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {open && (
        <div id={sectionId} className="section-content">
          {children}
        </div>
      )}
    </section>
  );
}
