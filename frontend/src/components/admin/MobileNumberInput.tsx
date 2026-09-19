"use client";

import React, { useEffect, useState } from "react";
import { ErrorBanner } from "./ErrorBanner";

export const MOBILE_DIGIT_LENGTH = 11;

// Used by every mobile-number field's Save/Submit handler — call before
// persisting and surface the returned message (e.g. via the same page's
// error banner) if it's non-null.
export function validateMobileNumber(value: string, opts?: { required?: boolean }): string | null {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return opts?.required ? "Mobile number is required." : null;
  if (digits.length !== MOBILE_DIGIT_LENGTH) return "Mobile number must contain 11 digits.";
  return null;
}

// Digits-only input capped at 11 characters — typing past the limit is
// blocked outright (not just trimmed on blur) and pops the shared red
// top-banner, matching every other mobile-number field in the app.
export const MobileNumberInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}> = ({ value, onChange, placeholder, disabled, className, id, onKeyDown }) => {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 3000);
    return () => clearTimeout(t);
  }, [warning]);

  return (
    <>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          if (digits.length > MOBILE_DIGIT_LENGTH) {
            setWarning("Mobile number must contain only 11 digits.");
            onChange(digits.slice(0, MOBILE_DIGIT_LENGTH));
            return;
          }
          onChange(digits);
        }}
        className={className}
      />
      {warning && <ErrorBanner message={warning} onClose={() => setWarning(null)} />}
    </>
  );
};
