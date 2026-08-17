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
