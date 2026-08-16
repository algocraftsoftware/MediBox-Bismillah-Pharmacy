import { Store, Supplier } from "./core";
import { RtvVia } from "./rtv";

// =======================================================
// ADJUSTMENT WITH OTHERS
// =======================================================

export type AdjOthersType = "SUPPLIER" | "OTHERS";
export type AdjStatus = "UNAPPROVED" | "APPROVED";

export interface AdjOthersItem {
  id: number;
  adjOthersId: number;
  rtvId: number;
  rtv: { id: number; rtvNo: string; totalAmount: number; createdAt: string; store: { id: number; name: string } };
  adjustmentAmount: number;
}

export interface AdjOthers {
  id: number;
  shopId: number;
  storeId: number;
  store: Store;
  supplierId: number;
  supplier: Supplier;
  adjType: AdjOthersType;
  via: RtvVia;
  txnNo: string;
  remarks: string | null;
  totalAdjustmentAmount: number;
  status: AdjStatus;
  createdById: number;
  createdBy?: { id: number; name: string; username: string };
  approvedById: number | null;
  approvedBy?: { id: number; name: string; username: string } | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: AdjOthersItem[];
}

export interface AdjOthersListResponse {
  rows: AdjOthers[];
  total: number;
  page: number;
  pageSize: number;
}
