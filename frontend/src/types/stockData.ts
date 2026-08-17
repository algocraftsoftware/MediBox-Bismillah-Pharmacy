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

// Create Stock takes the Stock Data columns that are actually data entry —
// Item No is generated from the catalog's own numbering, and Last Req./Last
// Sold Date are history that fills itself in from real requisitions and sales.
// Warehouse comes along because Purchase Price, Sales Price and Stock Qty live
// on a batch, which belongs to one warehouse.
export interface CreateStockInput {
  storeId: number;
  name: string;
  genericName?: string;
  displayCategory?: string;
  departmentId: number;
  subDepartmentId?: number | null;
  supplierId?: number | null;
  // "Item Type" on the form — the same Product.dosageForm that Stock Data
  // filters under the name "Dosage".
  dosageForm?: string;
  unit?: string;
  reorderLevel?: number;
  boxQty?: number;
  purchasePrice?: number;
  salesPrice?: number;
}

export interface CreatedStockRow {
  productId: number;
  batchId: number;
  itemNo: string;
  itemName: string;
  genericName: string;
  displayCategory: string | null;
  department: string;
  itemType: string | null;
  unit: string;
  reorderLevel: number;
  boxQty: number;
  purchasePrice: number;
  salesPrice: number;
  // Always 0 — an item created here holds no stock until a GRN receives it.
  stockQty: number;
}

export interface EditStockSaveResult {
  ok: boolean;
  rowsUpdated: number;
  productsUpdated: number;
  batchesUpdated: number;
}
