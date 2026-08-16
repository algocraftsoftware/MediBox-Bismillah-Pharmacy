import { RtvVia } from "./rtv";
import { Grn } from "./grn";

// =======================================================
// ADJUST WITH PO — shares the Grn/GrnItem shape (kind
// disambiguates it from a standard GRN With PO), plus the
// RTV credit lines and the "via" (Warehouse/Head Office) field.
// =======================================================

export type GrnKind = "STANDARD" | "ADJUST_WITH_PO";

export interface GrnRtvAdjustment {
  id: number;
  grnId: number;
  rtvId: number;
  rtv: { id: number; rtvNo: string; totalAmount: number; storeId: number; createdAt: string };
  adjustmentAmount: number;
}

export interface AdjWithPo extends Grn {
  kind: GrnKind;
  via: RtvVia | null;
  rtvAdjustmentValue: number;
  rtvAdjustments?: GrnRtvAdjustment[];
  department?: string | null;
}

export interface AdjWithPoListResponse {
  rows: AdjWithPo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RtvAdjustOption {
  id: number;
  rtvNo: string;
  totalAmount: number;
  createdAt: string;
  store: { id: number; name: string };
  remainingBalance: number;
}
