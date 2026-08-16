import React from "react";

const SIZE_CLASSES = {
  xs: "w-3.5 h-3.5 border-2",
  sm: "w-5 h-5 border-2",
  md: "w-9 h-9 border-[3px]",
  lg: "w-20 h-20 border-8",
} as const;

// "brand" (emerald arc on a light track) reads clearly on white/light
// backgrounds; "white" (white arc on a translucent-white track) is for use
// inside solid-color buttons where the brand color would blend in.
const VARIANT_CLASSES = {
  brand: "border-slate-200 border-t-emerald-700 border-r-emerald-700",
  white: "border-white/30 border-t-white border-r-white",
} as const;

export type SpinnerSize = keyof typeof SIZE_CLASSES;
export type SpinnerVariant = keyof typeof VARIANT_CLASSES;

// Simple two-tone circular spinner (rotating arc against a light track) —
// the shared "loading" motif used everywhere in the app instead of plain
// "Loading..."/"Saving..." text.
export const Spinner: React.FC<{ size?: SpinnerSize; variant?: SpinnerVariant; className?: string }> = ({
  size = "md",
  variant = "brand",
  className = "",
}) => (
  <div
    role="status"
    aria-label="Loading"
    className={`inline-block shrink-0 rounded-full animate-spin ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
  />
);

// Convenience wrapper for the common "centered block replacing a loading
// list/table/section" pattern, so call sites don't hand-roll the same
// flex/padding wrapper everywhere.
export const SectionLoader: React.FC<{ label?: string; className?: string }> = ({
  label = "Loading...",
  className = "",
}) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}>
    <Spinner size="lg" />
    {label && <p className="text-sm font-bold text-slate-400">{label}</p>}
  </div>
);
