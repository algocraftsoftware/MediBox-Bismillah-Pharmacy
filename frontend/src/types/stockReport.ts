// Pharmacy Stock Report — a valuation of stock on hand right now, not a
// period's sales. Both report shapes share the same money figures.
export type StockReportType = "DEPARTMENT" | "VENDOR";

export interface StockReportTotals {
  skuCount: number;
  qoh: number;
  cogs: number;
  salesValue: number;
  profit: number;
  profitPct: number;
}

export interface DepartmentStockRow extends StockReportTotals {
  outletName: string;
  departmentName: string;
}

export interface DepartmentStockReport {
  outlets: { outletName: string; rows: DepartmentStockRow[]; total: StockReportTotals }[];
  grandTotal: StockReportTotals;
}

export interface VendorStockRow extends StockReportTotals {
  storeName: string;
  vendorName: string;
}

export interface VendorStockReport {
  rows: VendorStockRow[];
  grandTotal: StockReportTotals;
}

export interface StockReportFilterValues {
  from?: string;
  to?: string;
  storeId?: string;
  departmentId?: string;
  subDepartmentId?: string;
  supplierId?: string;
  generic?: string;
  dosageForm?: string;
  productId?: string;
}
