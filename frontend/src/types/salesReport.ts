export type SalesReportName =
  | "INVOICE_WISE_DETAILS"
  | "PHARMACY_WISE_SUMMARY"
  | "ITEM_WISE_DETAILS"
  | "PHARMACY_CANCEL_SUMMARY"
  | "PHARMACY_CANCEL_DETAILS"
  | "PHARMACY_DUE_DETAILS"
  | "USER_WISE_COLL_SUMMARY"
  | "DUE_COLLECTION_DETAILS"
  | "DATE_WISE_SUMMARY"
  | "DATE_WISE_DETAILS"
  | "USER_WISE_DETAILS"
  | "PROFIT_DEPT_SUMMARY"
  | "PROFIT_SUBDEPT_SUMMARY"
  | "PROFIT_ITEM_WISE"
  | "PROFIT_SUPPLIER_SUMMARY"
  | "PROFIT_SUPPLIER_TOP_SHEET"
  | "PROFIT_SUPPLIER_DETAILS";

// One flat, pre-ordered row shape shared by every "ledger" report (Invoice/
// Date/User/Pharmacy Wise + the always-empty Cancel reports) — leaf invoice
// rows, group label rows, per-group "Total:" rows, and a final "Grand Total"
// row, exactly like the source PDF report layout. There is no cancellation
// or refund ledger in this app yet, so every Current/Previous *Cancel* and
// *Refund* column is always 0.
export interface SalesLedgerRow {
  key: string;
  isGroupHeader: boolean;
  isBanner: boolean;
  isTotal: boolean;
  invoiceNo: string | null;
  invoiceDate: string | null;
  noOfInv: number;
  cogs: number;
  currentCogsCancel: number;
  previousCogsCancel: number;
  totalSales: number;
  currentCancel: number;
  previousCancel: number;
  vat: number;
  currentVatCancel: number;
  previousVatCancel: number;
  actualTotalSales: number;
  currentDiscount: number;
  previousDiscount: number;
  netSales: number;
  currentCollection: number;
  previousCollection: number;
  currentRefund: number;
  previousRefund: number;
  netCollection: number;
  due: number;
}

export interface ItemWiseReportRow {
  itemName: string;
  genericName: string;
  department: string;
  qty: number;
  salesValue: number;
  cogs: number;
  discountAmount: number;
  vatAmount: number;
  netAmount: number;
}

export interface DueReportRow {
  saleId: number;
  invoiceNo: string;
  invoiceDate: string;
  storeName: string;
  customerCode: string;
  customerName: string;
  mobile: string;
  netSales: number;
  collected: number;
  due: number;
}

export interface UserCollectionSummaryRow {
  cashierName: string;
  noOfInv: number;
  cash: number;
  card: number;
  mobile: number;
  transfer: number;
  totalCollection: number;
  refund: number;
  netCollection: number;
}

// Shared shape across the 6 Pharmacy Sales Report (Profit) sub-reports —
// each report only populates the grouping fields relevant to it (e.g.
// departmentName for the dept summary, itemName/genericName for the
// item-wise/details reports) and leaves the rest undefined.
export interface ProfitReportRow {
  isSubTotal?: boolean;
  isGrandTotal?: boolean;
  storeName?: string;
  departmentName?: string;
  subDepartmentName?: string | null;
  supplierName?: string;
  itemCode?: string | null;
  barcode?: string | null;
  itemName?: string;
  genericName?: string;
  dosageForm?: string | null;
  displayCategory?: string | null;
  packSize?: number;
  ppPerPiece?: number;
  mrpPerPiece?: number;
  invoiceNo?: string;
  invoiceDate?: string;
  qty: number;
  cogs: number;
  salesValue: number;
  discAmt: number;
  vatAmt: number;
  netAmount: number;
  profit: number;
  profitPctBefore?: number;
  profitPctAfter?: number;
}

export interface SalesReportResponse {
  reportName: SalesReportName;
  ledgerRows?: SalesLedgerRow[];
  itemRows?: ItemWiseReportRow[];
  dueRows?: DueReportRow[];
  collectionRows?: UserCollectionSummaryRow[];
  profitRows?: ProfitReportRow[];
}
