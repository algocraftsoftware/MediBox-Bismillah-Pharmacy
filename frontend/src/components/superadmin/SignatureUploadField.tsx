"use client";

import React, { useId } from "react";
import { ImagePlus } from "lucide-react";

// One signature-slot uploader — shared by the Enroll/Edit Shop pages
// (currentUrl always absent on Enroll, since a new shop has none yet). A
// clickable dashed-border box rather than a raw <input type="file">, so the
// preview and the "click to change" affordance are the same clear target.
export function SignatureUploadField({
  label,
  file,
  onChange,
  currentUrl,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  currentUrl?: string | null;
}) {
  const inputId = useId();
  const previewSrc = file ? URL.createObjectURL(file) : currentUrl || null;

  return (
    <div>
      <label htmlFor={inputId} className="text-xs font-bold text-slate-700 block mb-1.5">
        {label}
      </label>
      <label
        htmlFor={inputId}
        className="group flex flex-col items-center justify-center gap-1.5 h-28 border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-lg cursor-pointer bg-slate-50 hover:bg-emerald-50/60 transition-colors px-2 text-center"
      >
        <input
          id={inputId}
          type="file"
          accept="image/*"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          className="sr-only"
        />
        {previewSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt={label} className="max-h-14 w-auto object-contain" />
            <span className="text-[10px] font-bold text-slate-500 group-hover:text-emerald-700">Click to replace</span>
          </>
        ) : (
          <>
            <ImagePlus className="w-5 h-5 text-slate-400 group-hover:text-emerald-600" />
            <span className="text-[11px] font-bold text-slate-500 group-hover:text-emerald-700">Click to upload</span>
          </>
        )}
      </label>
      {file ? (
        <p className="text-[10px] text-emerald-700 font-bold mt-1">New file selected — will be uploaded on save</p>
      ) : currentUrl ? (
        <p className="text-[10px] text-slate-400 font-semibold mt-1">Current signature (kept if unchanged)</p>
      ) : (
        <p className="text-[10px] text-slate-400 font-semibold mt-1">No signature uploaded yet</p>
      )}
    </div>
  );
}
