import { Store, Supplier } from "./core";

// =======================================================
// VIRTUAL STOCK TRANSFER (VST)
// =======================================================

export type VstStatus = "UNAPPROVED" | "APPROVED";

export interface VstItem {
  id: number;
  vstId: number;
  productId: number;
  product: {
    id: number;
    name: string;
    externalCode: string | null;
    genericName: string | null;
    unit: string;
    dosageForm: string | null;
    boxQty: number;
  };
  batchNo: string;
  expiryDate: string;
  packSize: number;
  ppPerPiece: number;
  mrpPerPiece: number;
  existingQoh: number;
  vstQtyPieces: number;
  totalPpValue: number;
  remarks: string | null;
}

export interface Vst {
  id: number;
  shopId: number;
  storeId: number;
  store?: Store;
  supplierId: number;
  supplier?: Supplier;
  vstNo: string;
  remarks: string | null;
  status: VstStatus;
  createdById: number;
  createdBy?: { id: number; name: string; username: string };
  approvedById: number | null;
  approvedBy?: { id: number; name: string; username: string } | null;
  approvedAt: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  items?: VstItem[];
  department?: string | null;
  itemCount?: number;
  vstToRtvPct?: number;
}

export interface VstListResponse {
  rows: Vst[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VstSearchItemRow {
  productId: number;
  itemCode: string | null;
  itemName: string;
  dosageForm: string | null;
  uom: string;
  packSize: number;
  batchNo: string;
  expiryDate: string;
  ppPerPiece: number;
  mrpPerPiece: number;
  existingQoh: number;
}
