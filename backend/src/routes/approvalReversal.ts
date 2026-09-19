import { Prisma } from '@prisma/client';
import { resolveBatch } from './receivedBatch';

// =======================================================
// UN-APPROVING A DOCUMENT
//
// Approval is the point at which a document stops being a plan and becomes a
// fact: a GRN books stock in, a VST takes stock out. Un-approving has to put
// that back exactly, or the shop's stock figures quietly stop matching what is
// on the shelf.
//
// Two rules apply everywhere:
//
//   1. Never let a reversal drive stock negative. If a GRN brought in 100 and
//      60 have since been sold, taking the 100 back out would leave -60. That
//      is not a reversal, it is corruption — so it is refused, with a message
//      naming the product and the numbers, and the admin is left to cancel the
//      sales first.
//
//   2. Never un-approve a document something downstream was built on. An
//      approved VST that an RTV was raised against, or a purchase order a GRN
//      was received against, has already been consumed; unwinding it would
//      strand the document that followed.
//
// Both rules fail loudly rather than silently doing half the work.
// =======================================================

// A transaction client — every reversal runs inside the same transaction as the
// status change, so a refusal leaves nothing half-applied.
export type Tx = Prisma.TransactionClient;

// Clearing the approval trail as well as the status. Leaving the approver and
// timestamp behind would make an unapproved document look approved on any
// screen that reads those fields rather than the status.
export const CLEAR_APPROVAL = { approvedById: null, approvedAt: null } as const;

type ReceivedItem = {
  productId: number;
  batchNo: string | null;
  expiryDate: Date | null;
  totalQtyPieces: number;
  product: { name: string; externalCode: string; department: { name: string } };
};

// Take back the stock a received document (GRN With PO, GRN Without PO,
// Adjustment With PO) booked in on approval. The inverse of the batch upsert
// those three share: same batch key, same quantity, decremented instead of
// incremented.
//
// The batch row itself is left in place at zero rather than deleted — it still
// carries the purchase price and MRP the goods came in at, and Create Stock
// already keeps zero-quantity batches for exactly that reason.
export async function reverseReceivedStock(tx: Tx, storeId: number, items: ReceivedItem[]) {
  for (const item of items) {
    if (item.totalQtyPieces <= 0) continue;

    // Resolved through the very same rule approval used, not off the line's own
    // batchNo. A non-pharma line received without one was booked into the
    // product's fallback batch, and reading batchNo here would find nothing —
    // which previously meant the line was skipped and its stock quietly left
    // behind. Nothing is skipped now; a line that cannot be matched is refused.
    const { batchNo } = resolveBatch(item);
    const name = item.product.name;

    const batch = await tx.batch.findUnique({
      where: { productId_storeId_batchNo: { productId: item.productId, storeId, batchNo } },
    });

    if (!batch) {
      throw new Error(
        `Cannot un-approve: the batch ${batchNo} for ${name} no longer exists, so the stock it added cannot be taken back.`,
      );
    }
    if (batch.stockQty < item.totalQtyPieces) {
      throw new Error(
        `Cannot un-approve: ${name} (batch ${batchNo}) has only ${batch.stockQty} in stock but this document brought in ${item.totalQtyPieces}. `
          + 'Some of it has already been sold or transferred — reverse those first.',
      );
    }

    await tx.batch.update({
      where: { id: batch.id },
      data: { stockQty: { decrement: item.totalQtyPieces } },
    });
  }
}

type IssuedItem = {
  productId: number;
  batchNo: string;
  vstQtyPieces: number;
  product?: { name: string } | null;
};

// Put back the stock a VST took out on approval. The inverse of the decrement
// that VST approval applies, and it cannot fail on quantity — returning stock
// only ever raises it — but the batch still has to be there to return it to.
export async function restoreIssuedStock(tx: Tx, storeId: number, items: IssuedItem[]) {
  for (const item of items) {
    if (item.vstQtyPieces <= 0) continue;

    const batch = await tx.batch.findUnique({
      where: {
        productId_storeId_batchNo: { productId: item.productId, storeId, batchNo: item.batchNo },
      },
    });
    if (!batch) {
      throw new Error(
        `Cannot un-approve: the batch ${item.batchNo} for ${item.product?.name || `product ${item.productId}`} no longer exists, `
          + 'so the stock it moved cannot be returned.',
      );
    }

    await tx.batch.update({
      where: { id: batch.id },
      data: { stockQty: { increment: item.vstQtyPieces } },
    });
  }
}

// Reversal failures are the caller's fault (stock already sold, a downstream
// document exists), not server faults, so they answer 400 with the explanation
// rather than a 500 with none.
export function unapproveError(err: unknown): string {
  return err instanceof Error && err.message.startsWith('Cannot un-approve')
    ? err.message
    : 'Could not un-approve this document';
}
