import { Store, Supplier } from "./core";
import { ShopAdminRole } from "./auth";
import { PurchaseOrder } from "./purchaseRequisition";

// =======================================================
// GRN WITH PO
// =======================================================

export type GrnStatus = "UNAPPROVED" | "APPROVED" | "CANCELED";

// Priced preview of a Purchase Order's items, returned by
// GET /grn/purchase-orders/:id/items — same shape priceGrnItems()
// produces plus the product display fields patched in, so the New
// page can show the grid before the GRN itself exists.
export interface GrnPoPreviewItem {
  productId: number;
  itemCode: string | null;
  itemName: string;
  genericName: string | null;
  uom: string;
  packSize: number;
  displayCategorySnapshot: string | null;
  orderQtyPieces: number;
  rcvQtyBox: number;
  rcvQtyPieces: number;
  bonusQtyBox: number;
  bonusQtyPieces: number;
  tradePrice: number;
  mrp: number;
  vatAmt: number;
  discAmt: number;
  batchNo: string | null;
  expiryDate: string | null;
  totalQtyPieces: number;
  totalValue: number;
  netTotal: number;
  unitPrice: number;
  gp: number;
  gpPct: number;
}

export interface GrnItem {
  id: number;
  grnId: number;
  productId: number;
  product: {
    id: number;
    name: string;
    externalCode: string | null;
    genericName: string | null;
    unit: string;
    boxQty: number;
  };
  displayCategorySnapshot: string | null;
  orderQtyPieces: number;
  rcvQtyBox: number;
  rcvQtyPieces: number;
  bonusQtyBox: number;
  bonusQtyPieces: number;
  totalQtyPieces: number;
  tradePrice: number;
  totalValue: number;
  vatAmt: number;
  discAmt: number;
  unitPrice: number;
  mrp: number;
  gp: number;
  gpPct: number;
  batchNo: string | null;
  expiryDate: string | null;
  netTotal: number;
}

export interface Grn {
  id: number;
  shopId: number;
  storeId: number;
  store: Store;
  supplierId: number;
  supplier: Supplier;
  purchaseOrderId: number | null;
  purchaseOrder: PurchaseOrder | null;
  transactionNo: string;
  invoiceNo: string;
  invoiceDate: string;
  paymentType: string;
  transactionRefNo: string | null;
  receivedById: number | null;
  receivedBy: { id: number; name: string; username: string; role: ShopAdminRole } | null;
  status: GrnStatus;
  createdById: number;
  createdBy: { id: number; name: string; username: string; role: ShopAdminRole };
  approvedById: number | null;
  approvedBy: { id: number; name: string; username: string; role: ShopAdminRole } | null;
  approvedAt: string | null;
  remarks: string | null;
  invoiceDiscount: number;
  invoiceVat: number;
  expiryAdjustmentAmount: number;
  attachmentUrl: string | null;
  totalTradeValue: number;
  totalVat: number;
  totalDiscount: number;
  netAmount: number;
  avgGpPct: number;
  createdAt: string;
  updatedAt: string;
  items?: GrnItem[];
}

export interface GrnListResponse {
  rows: Grn[];
  total: number;
  page: number;
  pageSize: number;
}
