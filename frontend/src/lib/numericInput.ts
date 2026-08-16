import React from "react";

// Blocks "-", "+", and scientific-notation "e"/"E" so numeric inputs can
// never accept a negative or malformed value in the first place.
export function blockNegativeKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
}

// Same as blockNegativeKeys, plus the decimal point — for quantity fields
// tied to stock/inventory (billing, item cancel/return, etc.), which must
// only ever accept whole units. Never applied to a price/amount input,
// where decimals are legitimate.
export function blockNonIntegerKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E" || e.key === ".") e.preventDefault();
}
