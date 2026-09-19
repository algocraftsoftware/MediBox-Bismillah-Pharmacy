import { DeliveryMode, PaymentStatus, Shift, Store } from "./core";
import { Customer } from "./customer";

export interface SaleItem {
  id: number;
  batchId: number;
  batch?: { id: number; barcode: string | null };
  productId: number;
  product?: { id: number; externalCode: string | null };
  productNameSnapshot: string;
  departmentSnapshot: string;
  supplierSnapshot: string | null;
  batchNoSnapshot: string;
  uom: string;
  mrp: number;
  qty: number;
  vatPct: number;
  vatAmt: number;
  discPct: number;
  discAmt: number;
  total: number;
  isFree: boolean;
  isPrdm: boolean;
  canceledQty: number;
  remainingQty?: number;
}

export interface SaleItemCancellation {
  id: number;
  saleItemId: number;
  saleId: number;
  qty: number;
  grossAmt: number;
  vatAmt: number;
  discAmt: number;
  netAmt: number;
  refundAmt: number;
  reason: string;
  canceledById: number;
  canceledBy?: { id: number; name: string; username: string };
  canceledAt: string;
}

export interface Sale {
  id: number;
  shopId: number;
  storeId: number;
  store?: Store;
  invoiceNo: string;
  customerId: number | null;
  customer?: Customer | null;
  cashierId: number;
  cashier?: { id: number; name: string; username: string };
  doctorName: string | null;
  doctorAddress: string | null;
  prescriptionId: string | null;
  consultationId: string | null;
  discountType: string;
  discAmt: number;
  discPct: number;
  itemAmount: number;
  vatAmount: number;
  totalAmount: number;
  netAmount: number;
  adjustAmount: number;
  receivable: number;
  paidCash: number;
  paidMobileBanking: number;
  paidCard: number;
  mobileBankingType: string | null;
  transactionNumber: string | null;
  cardType: string | null;
  bankName: string | null;
  paidAmount: number;
  dueAmount: number;
  refundAmount: number;
  paymentStatus: PaymentStatus;
  deliveryMode: DeliveryMode;
  deliveryType: string | null;
  remarks: string | null;
  shift: Shift;
  createdAt: string;
  items: SaleItem[];
}

export interface SaleListResponse {
  rows: Sale[];
  total: number;
  page: number;
  pageSize: number;
}
