import { GrnStatus } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const PAYMENT_TYPES = ["Credit", "Cash", "Sales", "Others"];

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
  orderQtyPieces: number;
  rcvQtyBox: number;
  rcvQtyPieces: number;
  bonusQtyPieces: number;
  // The PO's agreed price per piece — reference only, shown as "Prev. Price"
  // and never edited, so the originally ordered price stays visible next to
  // whatever was actually invoiced.
  tradePrice: number;
  // The invoiced price for this line, held as a mirrored pair kept in sync by
  // the grid: totalValue = unitPrice x rcvQtyPieces. Either box can be typed
  // into; whichever one the user edits recomputes the other. totalValue is the
  // figure that's persisted (the backend takes it as totalValueOverride), and
  // both are stored rather than derived so an exact typed value is never lost
  // to a round-trip through division.
  totalValue: number;
  unitPrice: number;
  vatAmt: number;
  discAmt: number;
  mrp: number;
  batchNo: string;
  expiryDate: string;
}

export const statusLabel = (s: GrnStatus) => (s === "APPROVED" ? "Approved" : "Unapproved");
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
