import { Store, Supplier } from "./core";
import { ShopAdminRole } from "./auth";

// =======================================================
// PURCHASE REQUISITION
// =======================================================

export type RequisitionMode = "PHARMA" | "NON_PHARMA";
export type RequisitionType = "REGULAR" | "URGENT" | "OTHERS";
export type RequisitionStatus = "UNAPPROVED" | "APPROVED" | "FINAL_APPROVED";

export interface RequisitionItemRow {
  productId: number;
  itemCode: string | null;
  itemName: string;
  genericName: string | null;
  uom: string;
  packSize: number;
  rol: number;
  qoh: number;
  ppPerPiece: number;
  mrpPerPiece: number;
  consumptionPieces: number;
  consumptionBox: number;
  gp: number;
  gpPct: number;
}

export interface RequisitionItemsResponse {
  rows: RequisitionItemRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PurchaseRequisitionItem {
  id: number;
  requisitionId: number;
  productId: number;
  product: {
    id: number;
    name: string;
    externalCode: string | null;
    genericName: string | null;
    unit: string;
    boxQty: number;
  };
  qtyBox: number;
  qtyPieces: number;
  ppPerPiece: number;
  mrpPerPiece: number;
  totalValue: number;
  gp: number;
  gpPct: number;
  remarks: string | null;
}

export interface PurchaseRequisition {
  id: number;
  shopId: number;
  storeId: number;
  store: Store;
  deliverTo: string;
  supplierId: number;
  supplier: Supplier;
  requisitionNo: string;
  mode: RequisitionMode;
  type: RequisitionType;
  consumptionDays: number;
  status: RequisitionStatus;
  reorderBelowOnly: boolean;
  createdById: number;
  createdBy: { id: number; name: string; username: string; role: ShopAdminRole };
  approvedById: number | null;
  approvedBy: { id: number; name: string; username: string; role: ShopAdminRole } | null;
  approvedAt: string | null;
  remarks: string | null;
  totalPPAmount: number;
  totalMrpAmount: number;
  avgGpPct: number;
  createdAt: string;
  updatedAt: string;
  orderNo: string | null;
  deliverToStoreId: number | null;
  deliverToStore: Store | null;
  paymentMode: string | null;
  expectedDate: string | null;
  finalApprovedById: number | null;
  finalApprovedBy: { id: number; name: string; username: string; role: ShopAdminRole } | null;
  finalApprovedAt: string | null;
  items?: PurchaseRequisitionItem[];
}

export type PurchaseOrder = PurchaseRequisition;

export interface PurchaseOrderListResponse {
  rows: PurchaseOrder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PurchaseOrderOption {
  id: number;
  orderNo: string | null;
  finalApprovedAt: string | null;
  totalPPAmount: number;
  supplier: { id: number; name: string };
  store: { id: number; name: string };
}

export interface PurchaseRequisitionListResponse {
  rows: PurchaseRequisition[];
  total: number;
  page: number;
  pageSize: number;
}
