import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { CityDefinition, CityTier } from "../types";

interface CitySearchProps {
  cities: CityDefinition[];
  open: boolean;
  onClose: () => void;
  onSelect: (city: string) => void;
}

export function CitySearch({ cities, open, onClose, onSelect }: CitySearchProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const matches = cities.filter((city) => city.name.includes(query.trim()));
  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    setQuery("");
    dialog.current?.showModal();
    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <dialog ref={dialog} id="city-search-dialog" className="city-search-dialog" aria-label="搜索城市"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="city-search-surface">
        <div className="city-search-input-row">
          <Search size={19} aria-hidden="true" />
          <input ref={input} type="search" value={query} placeholder="搜索城市" aria-label="搜索城市"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && matches[0]) { event.preventDefault(); onSelect(matches[0].name); }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                dialog.current?.querySelector<HTMLButtonElement>(".city-search-result")?.focus();
              }
            }} />
          <button type="button" className="icon-button" title="关闭搜索" aria-label="关闭搜索" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="city-search-results">
          {(["一线", "二线", "三线"] as CityTier[]).map((tier) => {
            const group = matches.filter((city) => city.tier === tier);
            if (!group.length) return null;
            return <section key={tier}>
              <h3>{tier}<span>{group.length} 城</span></h3>
              <div className="city-search-grid">
                {group.map((city) => <button key={city.name} type="button" className="city-search-result" onClick={() => onSelect(city.name)}>
                  {city.name}
                </button>)}
              </div>
            </section>;
          })}
          {!matches.length && <p className="city-search-empty" role="status">未找到城市</p>}
        </div>
      </div>
    </dialog>
  );
}
