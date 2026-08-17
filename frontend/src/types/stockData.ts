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

// Edit Stock shows the same grid as Stock Data, plus the row identity it needs
// to write an edit back to the right place. `batchId` is null when the item has
// no batch in the selected warehouse yet — that row's Purchase/Sales Price has
// nothing to write to (both are Batch columns), so those two cells are locked.
export interface EditStockRow extends StockDataRow {
  productId: number;
  batchId: number | null;
}

export interface EditStockResponse {
  rows: EditStockRow[];
  total: number;
  page: number;
  pageSize: number;
}

// Only the fields the user actually changed are sent, so an untouched column is
// never rewritten with a value the grid merely displayed.
export interface EditStockUpdate {
  productId: number;
  batchId: number | null;
  displayCategory?: string | null;
  purchasePrice?: number;
  salesPrice?: number;
  boxQty?: number;
}

export interface EditStockSaveResult {
  ok: boolean;
  rowsUpdated: number;
  productsUpdated: number;
  batchesUpdated: number;
}
