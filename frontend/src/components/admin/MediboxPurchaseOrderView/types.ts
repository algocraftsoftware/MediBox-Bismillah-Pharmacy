import { RequisitionStatus } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const GRID_FETCH_SIZE = 3000;
export const PAYMENT_MODES = ["Cash", "Credit", "Bank", "Others"];
export const CONSUMPTION_DAY_OPTIONS = [30, 60, 90, 120];

export interface ItemQty {
  qtyBox: number;
  qtyPieces: number;
  remarks: string;
}

export const statusLabel = (s: RequisitionStatus) =>
  s === "FINAL_APPROVED" ? "Final Approved" : s === "APPROVED" ? "Approved" : "Unapproved";
