"use client";

function formatSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

export function SlugInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center border border-slate-300 rounded overflow-hidden focus-within:border-emerald-500">
      <span className="px-2.5 py-2 bg-slate-100 text-slate-500 font-black text-sm border-r border-slate-300">/</span>
      <input
        required
        value={value}
        onChange={(e) => onChange(formatSlug(e.target.value))}
        className="flex-1 px-2.5 py-2 font-semibold text-slate-900 outline-none min-w-0"
        placeholder="xyzshop"
      />
      <span className="px-2.5 py-2 bg-slate-100 text-slate-500 font-semibold text-xs border-l border-slate-300 whitespace-nowrap">
        /login
      </span>
    </div>
  );
}
