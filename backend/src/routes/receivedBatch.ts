// =======================================================
// NON-PHARMA GOODS WITHOUT A BATCH
//
// Medicines must be received against a batch number and expiry date — that is
// what makes an expiry report or a recall possible. Non-pharma lines (devices,
// cosmetics, sundries) frequently carry neither, and holding up a whole GRN for
// a batch number that does not exist on the carton helps nobody.
//
// So a received line may omit both, but only when BOTH hold:
//   * the product's department is Non-Pharma, per the catalog; and
//   * the person approving is the pharmacy's admin account.
//
// The second condition is why this is checked at approval against the account's
// current role rather than trusted from the request: it is the admin who takes
// responsibility for stock arriving without traceability.
//
// Batch rows themselves still need a key, since stock is held per batch. Such
// lines land in the product's opening batch — the same "OPEN-<item no>" row
// Create Stock already makes — so a non-pharma product keeps one accumulating
// batch instead of sprouting an unnamed row per delivery.
// =======================================================
export const NON_PHARMA = 'Non-Pharma';

export const fallbackBatchNo = (externalCode: string) => `OPEN-${externalCode}`;

// The same rule expressed for raw SQL, so queries can tell a real batch number
// from the placeholder without duplicating the convention. `col` is the Batch
// alias and `prodCol` the Product alias, e.g. sqlIsFallbackBatch('b', 'p').
// A product with no item code yields NULL from the concatenation, so the
// comparison is false and the batch is treated as real — which it is.
export const sqlIsFallbackBatch = (batchAlias: string, productAlias: string) =>
  `${batchAlias}."batchNo" = 'OPEN-' || ${productAlias}."externalCode"`;

// What a GRN line's batch resolves to once received, mirroring resolveBatch()
// above: the stated batch number, or the product's fallback when the line was
// allowed through without one.
export const sqlResolvedGrnBatchNo = (grnItemAlias: string, productAlias: string) =>
  `COALESCE(${grnItemAlias}."batchNo", 'OPEN-' || ${productAlias}."externalCode")`;

// A placeholder date, only ever used when creating the fallback batch row. An
// existing row keeps the expiry it already has, so repeated deliveries cannot
// walk a product's expiry date forward.
export function fallbackExpiry(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d;
}

type ReceivedLine = {
  batchNo: string | null;
  expiryDate: Date | null;
  product: { name: string; externalCode: string; department: { name: string } };
};

// Which received lines still have to be refused for want of a batch/expiry.
export function linesMissingBatch(items: ReceivedLine[], isAdmin: boolean) {
  return items.filter((i) => {
    if (i.batchNo && i.expiryDate) return false;
    return !(isAdmin && i.product.department.name === NON_PHARMA);
  });
}

// Resolve what a line should actually be stored under.
export function resolveBatch(item: ReceivedLine) {
  if (item.batchNo && item.expiryDate) {
    return { batchNo: item.batchNo, expiryDate: item.expiryDate, isFallback: false };
  }
  return { batchNo: fallbackBatchNo(item.product.externalCode), expiryDate: fallbackExpiry(), isFallback: true };
}
