export const LIST_PAGE_SIZE = 10;
export const GRID_FETCH_SIZE = 3000;
export const DELIVER_TO_OPTIONS = ["Head Office", "Central Warehouse"];

export type ViewMode = "list" | "form";

export const statusLabel = (s: string) =>
  s === "FINAL_APPROVED" ? "Final Approved" : s === "APPROVED" ? "Approved" : "Unapproved";

export interface ItemQty {
  qtyBox: number;
  qtyPieces: number;
  remarks: string;
}
