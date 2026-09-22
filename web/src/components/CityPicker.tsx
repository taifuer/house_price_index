import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { CityDefinition, CityTier } from "../types";

const CITY_TIERS: CityTier[] = ["一线", "二线", "三线"];

interface CityPickerProps {
  cities: CityDefinition[];
  selected: string[];
  onChange: (cities: string[]) => void;
  maxSelected?: number;
  label?: string;
  colors?: ReadonlyMap<string, string>;
}

export function CityPicker({ cities, selected, onChange, maxSelected = 8, label = "城市选择", colors }: CityPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const groups = useMemo(() => {
    const normalizedQuery = query.trim();

    return CITY_TIERS.map((tier) => {
      const tierCities = cities.filter((city) => city.tier === tier);
      const visibleCities = tierCities
        .filter((city) => city.name.includes(normalizedQuery))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

      return {
        tier,
        cities: visibleCities,
        total: tierCities.length,
      };
    }).filter((group) => group.cities.length > 0);
  }, [cities, query]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const toggle = (city: string) => {
    if (selected.includes(city)) {
      onChange(selected.filter((item) => item !== city));
    } else if (selected.length < maxSelected) {
      onChange([...selected, city]);
    }
  };

  return (
    <div className={`city-picker${open ? " is-open" : ""}`} ref={rootRef} role="group" aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}>
      <div className="city-picker-control">
        <div className="city-tags">
          {selected.map((city) => (
            <span className="city-tag" key={city}>
              {colors?.has(city) && <span className="city-color-swatch" style={{ backgroundColor: colors.get(city) }} aria-hidden="true" />}
              {city}
              <button type="button" onClick={() => toggle(city)} title={`移除${city}`} aria-label={`移除${city}`}>
                <X size={13} />
              </button>
            </span>
          ))}
          {selected.length === 0 && <span className="city-placeholder">请选择城市</span>}
        </div>
        <button ref={triggerRef} type="button" className="city-picker-trigger" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}>
          选择城市
        </button>
      </div>
      {open && (
        <div id={menuId} className="city-picker-menu">
          <label className="city-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索城市" aria-label="搜索城市" autoFocus />
          </label>
          <div className="city-options">
            {groups.map((group) => (
              <section className="city-option-group" key={group.tier}>
                <h4 className="city-option-group-title">
                  {group.tier}
                  <span>
                    （{query.trim() ? `${group.cities.length}/${group.total}` : group.total}）
                  </span>
                </h4>
                <div className="city-option-grid">
                  {group.cities.map((city) => {
                    const checked = selected.includes(city.name);
                    const disabled = !checked && selected.length >= maxSelected;
                    return (
                      <button key={city.name} type="button" aria-pressed={checked} disabled={disabled} onClick={() => toggle(city.name)}>
                        <span className={`city-check${checked ? " is-checked" : ""}`}>
                          {checked && <Check size={13} />}
                        </span>
                        {city.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {groups.length === 0 && <div className="city-options-empty">未找到城市</div>}
          </div>
          <div className="city-picker-hint">最多选择 {maxSelected} 个城市</div>
        </div>
      )}
    </div>
  );
}
