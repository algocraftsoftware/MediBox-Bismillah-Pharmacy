import { GrnStatus, RtvVia } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const DEBOUNCE_MS = 300;
export const PAYMENT_TYPES = ["Cash", "Credit", "After Sale"];
export const VIA_OPTIONS: { value: RtvVia; label: string }[] = [
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "HEAD_OFFICE", label: "Head Office" },
];

export const statusLabel = (s: GrnStatus) => (s === "APPROVED" ? "Approved" : s === "CANCELED" ? "Canceled" : "Unapproved");
export const viaLabel = (v: RtvVia | null | undefined) => (v === "HEAD_OFFICE" ? "Head Office" : "Warehouse");
export const toDateInput = (iso: string | null) => (iso ? iso.split("T")[0] : "");

export interface AdjItemDraft {
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

export interface RtvLineDraft {
  rtvId: number;
  rtvNo: string;
  rtvDate: string;
  storeName: string;
  rtvAmount: number;
  availableBalance: number;
  adjustmentAmount: string;
}
