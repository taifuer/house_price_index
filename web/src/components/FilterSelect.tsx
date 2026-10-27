import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { ChevronDown } from "lucide-react";

export const FilterSelect = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<"select"> & { variant?: "field" | "compact" | "inline" }>(
  ({ children, variant = "field", className = "", ...props }, ref) => (
    <span className={`filter-select filter-select-${variant} ${className}`}>
      <select ref={ref} {...props}>{children}</select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  ),
);
FilterSelect.displayName = "FilterSelect";
