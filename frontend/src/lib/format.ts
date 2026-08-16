// Shared currency-style number formatters used across the admin views
// (GRN, VST, RTV, Adjust With PO/Others, Purchase Requisition/Order,
// Invoice Item Cancel, Sales Report) — centralizes the formula that was
// previously copy-pasted identically into each of those files.
export const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt4 = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
