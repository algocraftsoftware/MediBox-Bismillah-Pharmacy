import { RtvStatus, RtvVia } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const VIA_OPTIONS: { value: RtvVia; label: string }[] = [
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "HEAD_OFFICE", label: "Head Office" },
];

export const statusLabel = (s: RtvStatus) => (s === "APPROVED" ? "Approved" : "Unapproved");
export const viaLabel = (v: RtvVia) => (v === "HEAD_OFFICE" ? "Head Office" : "Warehouse");

export interface RtvItemRow {
  vstItemId: number;
  itemCode: string | null;
  itemName: string;
  dosageForm: string | null;
  uom: string;
  packSize: number;
  purchasePrice: number;
  salesPrice: number;
  batchNo: string;
  expiryDate: string;
  itemQtyPieces: number;
  availableQty: number;
  selected: boolean;
  rtvQty: string;
}
