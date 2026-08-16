"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  label?: string;
  // When true, pressing Enter applies whatever the user typed as the filter
  // value (used by Generic so an ingredient fragment like "para" matches
  // every medicine sharing that ingredient). Otherwise Enter just picks the
  // first matching option.
  allowFreeText?: boolean;
}

const MAX_OPTIONS = 100;

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Select...",
  label,
  allowFreeText = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, MAX_OPTIONS)
    : options.slice(0, MAX_OPTIONS);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  // While typing in a free-text field the value is committed live, so clicking
  // the SEARCH button right away uses the exact ingredient text typed.
  const displayValue = open ? query : allowFreeText ? value : selected?.label ?? "";

  return (
    <div className="relative" ref={ref}>
      {label && <label className="font-bold text-slate-700 block mb-1">{label}</label>}
      <div className="relative">
        <input
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            // Opening always starts from the full list, not pre-filtered down
            // to whatever's already selected — otherwise re-opening a field
            // that already has a value only ever shows that one match, making
            // it look like you can't change it.
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (allowFreeText) onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (allowFreeText && query.trim()) commit(query.trim());
              else if (filtered[0]) commit(filtered[0].value);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold pr-7 outline-none focus:border-emerald-500"
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>

      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-300 rounded shadow-lg">
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-slate-400 font-semibold text-xs">No matches</li>
          )}
          {filtered.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => commit(o.value)}
                className={`w-full text-left px-2 py-1.5 text-xs font-semibold hover:bg-emerald-50 flex items-center justify-between ${
                  o.value === value ? "text-emerald-700" : "text-slate-700"
                }`}
              >
                {o.label}
                {o.value === value && <Check className="w-3.5 h-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
