export type ExpireProductsType = "EXPIRED" | "EXPIRABLE";

export interface ExpireProductRow {
  itemNo: string | null;
  itemName: string;
  group: string | null;
  supplier: string | null;
  mrp: number;
  pp: number;
  stockQty: number;
  batch: string;
  expDate: string;
}

export interface ExpireProductsResponse {
  rows: ExpireProductRow[];
  total: number;
  page: number;
  pageSize: number;
}
