// Splits `total` across `weights` proportionally (e.g. spreading an
// invoice-level Discount or VAT amount across line items by their Total
// Value share). The last item with a non-zero weight absorbs whatever
// rounding remainder is left so the parts always sum to exactly `total`
// instead of drifting a cent off from floating-point rounding.
export function splitProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const lastNonZeroIdx = weights.reduce((last, w, idx) => (w > 0 ? idx : last), -1);
  let allocated = 0;
  return weights.map((w, idx) => {
    if (idx === lastNonZeroIdx) return Math.max(0, Math.round((total - allocated) * 100) / 100);
    const amount = Math.max(0, Math.round(total * (w / sum) * 100) / 100);
    allocated += amount;
    return amount;
  });
}
