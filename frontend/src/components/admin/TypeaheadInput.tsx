"use client";

import React, { useEffect, useRef, useState } from "react";

// A type-to-filter text input — used for Mobile Banking Type / Card Type /
// Bank Name so those behave like the Item Name search instead of a plain
// native <select>. Free text is still accepted; suggestions just narrow.
// Promoted out of AsterBillingView so Due Collection's Receive Payment modal
// can share the same combined dropdown+search behavior (including arrow-key
// navigation) instead of a bare native <select>/text input.
export const TypeaheadInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, options, placeholder, className }) => {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = value ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase())) : options;

  useEffect(() => {
    setHighlighted(0);
  }, [value, open]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((h) => (h + 1) % filtered.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((h) => (h - 1 + filtered.length) % filtered.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            commit(filtered[highlighted]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-300 rounded shadow-xl z-50 max-h-48 overflow-y-auto">
          {filtered.map((o, idx) => (
            <button
              key={o}
              type="button"
              onMouseEnter={() => setHighlighted(idx)}
              onClick={() => commit(o)}
              className={`w-full text-left px-2.5 py-1.5 text-xs border-b border-slate-50 last:border-0 ${
                idx === highlighted ? "bg-emerald-50" : "hover:bg-emerald-50"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
