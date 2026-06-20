import { useState, useRef, useEffect, type ReactNode } from "react";

interface FilterDropdownItem {
  key: string;
  label: string;
  count?: number;
}

interface FilterDropdownProps {
  items: FilterDropdownItem[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  placeholder: string;
  icon?: ReactNode;
  renderItem?: (item: FilterDropdownItem, isSelected: boolean, isHighlighted: boolean) => ReactNode;
  highlightKey?: string | null;
  highlightTag?: string;
}

export function FilterDropdown({
  items, selected, onSelect, placeholder, icon, renderItem, highlightKey, highlightTag,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = filter
    ? items.filter((item) => item.label.toLowerCase().includes(filter.toLowerCase()))
    : items;

  const selectedLabel = selected
    ? items.find((item) => item.key === selected)?.label || selected
    : null;

  return (
    <div className="relative" ref={ref}>
      <button
        className={`px-2.5 py-1 rounded-full text-[13px] font-medium transition-colors border flex items-center gap-1 ${
          selected
            ? "bg-primary/10 text-primary border-primary/30"
            : "text-ink-muted border-hairline hover:text-ink hover:border-hairline-soft"
        }`}
        onClick={() => { setOpen(!open); if (open) setFilter(""); }}
      >
        {selected ? (
          <>
            {selectedLabel}
            <span className="ml-0.5 text-[11px] opacity-60 hover:opacity-100 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onSelect(null); setOpen(false); }}>
              &times;
            </span>
          </>
        ) : (
          <>
            {icon}
            {placeholder}
          </>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-canvas border border-hairline rounded-[12px] shadow-lg z-50 overflow-hidden">
          <div className="p-1.5">
            <input type="text"
              className="w-full px-2.5 py-1.5 text-[13px] bg-surface-card rounded-[8px] border-none outline-none text-ink placeholder:text-ink-muted"
              placeholder={`Search ${placeholder.toLowerCase()}...`} value={filter}
              onChange={(e) => setFilter(e.target.value)} autoFocus />
          </div>
          <div className="max-h-52 overflow-y-auto scrollbar-thin">
            <button className={`w-full text-left px-3 py-2 text-[13px] transition-colors hover:bg-surface-card ${!selected ? "text-primary font-medium" : "text-ink-muted"}`}
              onClick={() => { onSelect(null); setOpen(false); }}>
              All
            </button>
            {filtered.map((item) => {
              const isSelected = selected === item.key;
              const isHighlighted = highlightKey ? item.key.toLowerCase() === highlightKey.toLowerCase() : false;
              return (
                renderItem ? (
                  <div key={item.key} onClick={() => { onSelect(item.key); setOpen(false); }}>
                    {renderItem(item, isSelected, isHighlighted)}
                  </div>
                ) : (
                  <button key={item.key}
                    className={`w-full text-left px-3 py-2 text-[13px] transition-colors hover:bg-surface-card flex items-center gap-2 ${
                      isSelected ? "text-primary font-medium" : "text-ink-muted"
                    }`}
                    onClick={() => { onSelect(item.key); setOpen(false); }}>
                    <span>{item.label}</span>
                    {isHighlighted && highlightTag && <span className="text-[10px] bg-primary/10 text-primary px-1 py-px rounded-full font-medium">{highlightTag}</span>}
                    {item.count !== undefined && <span className="ml-auto text-[11px] opacity-50">{item.count}</span>}
                  </button>
                )
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-[13px] text-ink-muted text-center">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
