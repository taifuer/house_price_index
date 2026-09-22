import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { ChevronDown } from "lucide-react";

export const FilterSelect = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<"select">>(
  ({ children, ...props }, ref) => (
    <span className="filter-select">
      <select ref={ref} {...props}>{children}</select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  ),
);
FilterSelect.displayName = "FilterSelect";
