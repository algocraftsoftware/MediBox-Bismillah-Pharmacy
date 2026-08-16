import { GrnStatus } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const PAYMENT_TYPES = ["Credit", "Cash", "Sales", "Others"];

export interface GrnItemDraft {
  productId: number;
  itemCode: string | null;
  itemName: string;
  genericName: string | null;
  displayCategory: string | null;
  uom: string;
  packSize: number;
  orderQtyPieces: number;
  rcvQtyBox: number;
  rcvQtyPieces: number;
  bonusQtyPieces: number;
  tradePrice: number;
  vatAmt: number;
  discAmt: number;
  mrp: number;
  batchNo: string;
  expiryDate: string;
}

export const statusLabel = (s: GrnStatus) => (s === "APPROVED" ? "Approved" : "Unapproved");
export const toDateInput = (iso: string | null) => (iso ? iso.split("T")[0] : "");
