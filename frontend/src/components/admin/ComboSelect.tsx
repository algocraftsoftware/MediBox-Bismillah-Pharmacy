"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Button-triggered searchable dropdown (click to open a panel with its own
// search box + option list) — distinct from SearchableSelect.tsx (a
// type-directly-into-the-main-input combobox used by Stock Data/Expire
// Products). This is the pattern GRN/VST/RTV/Adjust-With-PO/Adjust-With-
// Others share identically; centralized here instead of being redefined in
// each of those files.
export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
}

export const ComboSelect: React.FC<{
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}> = ({ options, value, onChange, placeholder = "Select...", disabled, className }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  const visible = filtered.slice(0, 60);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlighted] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = visible[highlighted];
      if (o) commit(o.value);
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
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            className="w-full px-2 py-1.5 border-b border-slate-200 outline-none text-xs font-semibold sticky top-0 bg-white"
          />
          <div ref={listRef}>
            {visible.map((o, idx) => (
              <button
                key={o.value}
                type="button"
                onClick={() => commit(o.value)}
                onMouseEnter={() => setHighlighted(idx)}
                className={`w-full text-left px-2.5 py-1.5 text-xs border-b border-slate-50 last:border-0 ${
                  idx === highlighted ? "bg-emerald-50" : "hover:bg-emerald-50"
                }`}
              >
                <div className="font-bold text-slate-900">{o.label}</div>
                {o.sublabel && <div className="text-slate-400 text-[10px]">{o.sublabel}</div>}
              </button>
            ))}
          </div>
          {filtered.length === 0 && <div className="px-2.5 py-3 text-slate-400 text-xs text-center">No matches</div>}
        </div>
      )}
    </div>
  );
};
