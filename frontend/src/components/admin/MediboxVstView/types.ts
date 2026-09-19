import { VstStatus } from "../../../types";

export const LIST_PAGE_SIZE = 10;
export const DEBOUNCE_MS = 300;

export const statusLabel = (s: VstStatus) => (s === "APPROVED" ? "Approved" : "Unapproved");
export const toDateInput = (iso: string | null) => (iso ? iso.split("T")[0] : "");

export interface VstItemDraft {
  productId: number;
  itemCode: string | null;
  itemName: string;
  packSize: number;
  ppPerPiece: number;
  mrpPerPiece: number;
  existingQoh: number;
  batchNo: string;
  expiryDate: string;
  vstQtyPieces: string;
  remarks: string;
}
