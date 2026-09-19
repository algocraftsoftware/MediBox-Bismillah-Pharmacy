import { GrnStatus } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const DEBOUNCE_MS = 300;
export const PAYMENT_TYPES = ["Cash", "Credit", "After Sale"];

export interface GrnItemDraft {
  productId: number;
  itemCode: string | null;
  itemName: string;
  genericName: string | null;
  displayCategory: string | null;
  // Non-pharma lines may be received without a batch number or expiry date
  // (admin only), so the grid needs to know which department a line belongs to
  // before it flags a blank batch box as a problem.
  departmentName?: string | null;
  uom: string;
  packSize: number;
  rcvQtyBox: number;
  rcvQtyPieces: number;
  bonusQtyPieces: number;
  tradePrice: number;
  // Editable — defaults to tradePrice * rcvQtyPieces when qty changes, but
  // can be manually overwritten to whatever the invoice actually charged
  // (e.g. a price change since the last purchase). Unit Price is derived
  // from this, not the other way around.
  totalValue: number;
  vatAmt: number;
  discAmt: number;
  mrp: number;
  batchNo: string;
  expiryDate: string;
}

export const statusLabel = (s: GrnStatus) => (s === "APPROVED" ? "Approved" : s === "CANCELED" ? "Canceled" : "Unapproved");
export const toDateInput = (iso: string | null) => (iso ? iso.split("T")[0] : "");

// A blank batch box is only a problem when the server would actually refuse it.
// Non-pharma goods (devices, cosmetics, sundries) often carry no batch number
// or expiry date on the carton, and the pharmacy admin is allowed to receive
// them without one — so flagging those lines red would be telling the admin
// something untrue. Mirrors linesMissingBatch() on the server.
export const NON_PHARMA = "Non-Pharma";

export const batchMissingFor = (
  item: { totalQtyPieces: number; batchNo: string; departmentName?: string | null },
  isAdmin: boolean,
) => {
  if (item.totalQtyPieces <= 0 || item.batchNo) return false;
  return !(isAdmin && item.departmentName === NON_PHARMA);
};
