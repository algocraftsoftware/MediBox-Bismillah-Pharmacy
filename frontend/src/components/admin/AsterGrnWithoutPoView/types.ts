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
