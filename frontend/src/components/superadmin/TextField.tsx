"use client";

import React from "react";

// Shared labeled text/password/email input — cuts the repeated label+input
// markup that was copy-pasted ~10x per shop form.
export const TextField: React.FC<
  { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>
> = ({ label, hint, className, ...props }) => (
  <div>
    <label className="text-xs font-bold text-slate-700 block mb-1">
      {label}
      {hint && <span className="text-slate-400 font-semibold normal-case"> ({hint})</span>}
    </label>
    <input
      {...props}
      className={`w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold text-slate-900 normal-case ${className || ""}`}
    />
  </div>
);
