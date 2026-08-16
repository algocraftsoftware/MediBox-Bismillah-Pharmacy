"use client";

import { ALL_FEATURES, ALL_FEATURE_IDS } from "../../lib/menuFeatures";

export function PermissionChecklist({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="border border-slate-200 rounded p-3 bg-slate-50">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-48 overflow-y-auto">
        {ALL_FEATURES.map((f) => (
          <label key={f.id} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={() => toggle(f.id)}
              className="w-3.5 h-3.5 accent-[#ADEBB3] shrink-0"
            />
            <span className="truncate">{f.label}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-3 mt-2 pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={() => onChange(ALL_FEATURE_IDS)}
          className="text-[10px] font-bold text-emerald-700 hover:underline"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[10px] font-bold text-red-600 hover:underline"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
