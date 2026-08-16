export type StockDataType = "ALL" | "AVAILABLE" | "ZERO";

export interface StockDataRow {
  itemNo: string | null;
  itemName: string;
  genericName: string;
  displayCategory: string | null;
  department: string;
  manufacturer: string | null;
  lastPurchaseReqDate: string | null;
  lastSoldDate: string | null;
  purchasePrice: number | null;
  salesPrice: number | null;
  boxQty: number;
  stockQty: number;
}

export interface StockDataResponse {
  rows: StockDataRow[];
  total: number;
  page: number;
  pageSize: number;
}
