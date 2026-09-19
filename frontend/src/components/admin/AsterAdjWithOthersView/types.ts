import { AdjOthersType, AdjStatus, RtvVia } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const DEBOUNCE_MS = 300;

export const ADJ_TYPES: { value: AdjOthersType; label: string }[] = [
  { value: "SUPPLIER", label: "Supplier" },
  { value: "OTHERS", label: "Others" },
];
export const VIA_OPTIONS: { value: RtvVia; label: string }[] = [
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "HEAD_OFFICE", label: "Head Office" },
];

export const statusLabel = (s: AdjStatus) => (s === "APPROVED" ? "Approved" : "Unapproved");
export const viaLabel = (v: RtvVia) => (v === "HEAD_OFFICE" ? "Head Office" : "Warehouse");
export const adjTypeLabel = (t: AdjOthersType) => (t === "OTHERS" ? "Others" : "Supplier");

export interface RtvLineDraft {
  rtvId: number;
  rtvNo: string;
  rtvDate: string;
  storeName: string;
  rtvAmount: number;
  availableBalance: number;
  adjustmentAmount: string;
}
