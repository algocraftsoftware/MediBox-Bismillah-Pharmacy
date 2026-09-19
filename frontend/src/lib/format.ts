// Shared currency-style number formatters used across the admin views
// (GRN, VST, RTV, Adjust With PO/Others, Purchase Requisition/Order,
// Invoice Item Cancel, Sales Report) — centralizes the formula that was
// previously copy-pasted identically into each of those files.
export const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt4 = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

// Trims binary-float noise off a computed figure before it goes into an input
// box — 152.1 / 15 is 10.140000000000002 in IEEE-754, and that shouldn't be
// what the user sees in an editable cell. 4dp matches the fmt4 display used
// for money totals, so nothing visible is lost.
export const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Reference fields — document numbers (GRN/PO/VST/RTV/ADJ), invoice numbers,
// supplier names, item codes, product names and batch numbers — print in
// capitals on every report.
//
// The shop works with Caps Lock on, so most of this data is already uppercase
// and the reports looked consistent by accident. Anything typed without it
// (an invoice number, a hand-added supplier) then printed in lower case next
// to everything else. Forcing the case at render time makes the documents read
// the same whichever way the value was entered, and changes nothing about what
// is stored or searched.
export const upper = (v: string | null | undefined) => (v ?? "").toUpperCase();
