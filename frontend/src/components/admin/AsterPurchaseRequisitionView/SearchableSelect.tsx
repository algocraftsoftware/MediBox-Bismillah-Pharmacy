"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ComboOption } from "../ComboSelect";

// =======================================================
// SEARCHABLE DROPDOWN — used for Supplier and the quick-add
// Item Name field, both of which need to filter long lists.
// Keeps its own richer implementation (keyboard arrow-nav,
// onEnterSelect) rather than the shared ComboSelect.
// =======================================================

export const SearchableSelect: React.FC<{
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // Fired after a selection is confirmed via the Enter key specifically
  // (not a mouse click) — lets a caller move focus straight to the next
  // field, e.g. Item Name -> REQ(BOX).
  onEnterSelect?: (value: string) => void;
}> = ({ options, value, onChange, placeholder = "Select...", disabled, className, onEnterSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  // Keyboard nav moves the highlight, but the list itself needs to be told
  // to scroll — without this the highlighted row can move past the visible
  // area while the scrollbar stays put, hiding the very option being picked.
  useEffect(() => {
    optionRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const choose = (o: ComboOption, viaEnter: boolean) => {
    onChange(o.value);
    setOpen(false);
    setQuery("");
    if (viaEnter) onEnterSelect?.(o.value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[highlighted] || filtered[0];
      if (o) choose(o, true);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left border border-slate-300 rounded px-2 py-1.5 font-semibold bg-white disabled:bg-slate-100 truncate flex items-center justify-between gap-1"
      >
        <span className={`truncate ${selected ? "text-slate-900" : "text-slate-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-60 bg-white border border-slate-300 rounded shadow-xl z-50 max-h-64 overflow-y-auto">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Type to search..."
            className="w-full px-2 py-1.5 border-b border-slate-200 outline-none text-xs font-semibold sticky top-0 bg-white"
          />
          {filtered.slice(0, 60).map((o, i) => (
            <button
              key={o.value}
              type="button"
              ref={(el) => {
                optionRefs.current[i] = el;
              }}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => choose(o, false)}
              className={`w-full text-left px-2.5 py-1.5 text-xs border-b border-slate-50 last:border-0 ${
                i === highlighted ? "bg-emerald-100" : "hover:bg-emerald-50"
              }`}
            >
              <div className="font-bold text-slate-900">{o.label}</div>
              {o.sublabel && <div className="text-slate-400 text-[10px]">{o.sublabel}</div>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2.5 py-3 text-slate-400 text-xs text-center">No matches</div>
          )}
        </div>
      )}
    </div>
  );
};
