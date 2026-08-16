"use client";

import { useEffect } from "react";

// Browsers increment/decrement a focused <input type="number"> on mouse
// wheel scroll — a well-known footgun that turns "scroll the page" into
// "silently change this quantity field." One delegated listener disables it
// app-wide instead of patching every numeric input individually.
export function NumberInputWheelGuard() {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.type === "number") {
        e.preventDefault();
        target.blur();
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  return null;
}
