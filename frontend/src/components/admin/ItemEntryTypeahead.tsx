"use client";

import React, { useEffect, useRef, useState } from "react";

export interface ItemEntryTypeaheadProps<T> {
  value: string;
  onValueChange: (v: string) => void;
  fetchResults: (query: string) => Promise<T[]>;
  onSelect: (row: T) => void;
  getKey: (row: T) => string | number;
  getLabel: (row: T) => string;
  getSublabel?: (row: T) => string | undefined;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  minChars?: number;
  debounceMs?: number;
}

// Shared live-search-then-select box used by GRN Without PO and VST's
// item-entry staging row — debounced search, arrow-key navigation, Enter
// (or click) selects. Callers own where focus goes next via `onSelect`.
export function ItemEntryTypeahead<T>({
  value,
  onValueChange,
  fetchResults,
  onSelect,
  getKey,
  getLabel,
  getSublabel,
  placeholder = "Search item...",
  disabled,
  inputRef,
  minChars = 2,
  debounceMs = 250,
}: ItemEntryTypeaheadProps<T>) {
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);

  const setInputRef = (el: HTMLInputElement | null) => {
    localInputRef.current = el;
    if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
  };

  useEffect(() => {
    if (value.trim().length < minChars) {
      setResults([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchResults(value)
        .then((rows) => {
          setResults(rows);
          setHighlighted(0);
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const commit = (row: T) => {
    setOpen(false);
    setResults([]);
    onSelect(row);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlighted] || results[0];
      if (r) commit(r);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={setInputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-60 bg-white border border-slate-300 rounded shadow-xl z-50 max-h-64 overflow-y-auto">
          {results.map((r, idx) => (
            <button
              key={getKey(r)}
              type="button"
              onClick={() => commit(r)}
              className={`w-full text-left px-2.5 py-1.5 text-xs border-b border-slate-50 last:border-0 ${
                idx === highlighted ? "bg-emerald-50" : "hover:bg-emerald-50"
              }`}
            >
              <div className="font-bold text-slate-900">{getLabel(r)}</div>
              {getSublabel && <div className="text-slate-400 text-[10px]">{getSublabel(r)}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
