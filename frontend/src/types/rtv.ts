import { Store, Supplier } from "./core";

// =======================================================
// RETURN TO VENDOR (RTV)
// =======================================================

export type RtvVia = "WAREHOUSE" | "HEAD_OFFICE";
export type RtvStatus = "UNAPPROVED" | "APPROVED";

export interface VstOption {
  id: number;
  vstNo: string;
  createdAt: string;
  totalAmount: number;
  supplier: { id: number; name: string };
  store: { id: number; name: string };
}

export interface VstItemForRtv {
  vstItemId: number;
  productId: number;
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
  alreadyReturnedQty: number;
  availableQty: number;
}

export interface RtvItem {
  id: number;
  rtvId: number;
  vstItemId: number;
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
  purchasePrice: number;
  salesPrice: number;
  itemQtyPieces: number;
  rtvQtyPieces: number;
  rtvValue: number;
  remainingQtyPieces: number;
  remainingValue: number;
}

export interface Rtv {
  id: number;
  shopId: number;
  storeId: number;
  store?: Store;
  via: RtvVia;
  vstId: number;
  vst?: { id: number; vstNo: string; totalAmount: number };
  supplierId: number;
  supplier?: Supplier;
  rtvNo: string;
  receiverName: string;
  receiverContact: string;
  remarks: string | null;
  status: RtvStatus;
  createdById: number;
  createdBy?: { id: number; name: string; username: string };
  approvedById: number | null;
  approvedBy?: { id: number; name: string; username: string } | null;
  approvedAt: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  items?: RtvItem[];
  department?: string | null;
}

export interface RtvListResponse {
  rows: Rtv[];
  total: number;
  page: number;
  pageSize: number;
}
