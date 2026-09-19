"use client";

import React from "react";

// Card-styled section wrapper shared by the Enroll/Edit Shop pages, so a
// long form reads as clearly grouped steps instead of one continuous list
// of fields.
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">{title}</h2>
        {description && <p className="text-xs text-slate-500 font-semibold mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}
