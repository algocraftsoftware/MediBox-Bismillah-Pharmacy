import { ControlledClass } from "./core";

// A search result row: one row per batch (what's actually sellable), joined
// with its product/department/supplier info — this is what the Billing
// item-search combobox returns.
export interface BatchSearchResult {
  batchId: number;
  batchNo: string;
  expiryDate: string;
  mrp: number;
  sellingPrice: number;
  purchasePrice: number;
  vatPct: number;
  discPct: number;
  stockQty: number;
  barcode: string | null;
  productId: number;
  productName: string;
  genericName: string;
  unit: string;
  isPrescriptionRequired: boolean;
  controlledClass: ControlledClass;
  displayCategory: string | null;
  departmentName: string;
  supplierName: string | null;
}

// A line in the billing cart, built from a BatchSearchResult plus the
// quantity/free flag chosen by the cashier.
export interface CartLine {
  batchId: number;
  productId: number;
  productName: string;
  genericName: string;
  // The product's own Display Category (e.g. "G-08-(14) CNS/BENZODIAZEPINES"),
  // shown in the cart's Display Category column. Deliberately NOT the
  // department name — that's a much coarser bucket ("Pharma"/"Non-Pharma"), and
  // rendering it here is what used to make every line read "PHARMA".
  displayCategory: string | null;
  supplierName: string | null;
  uom: string;
  vatPct: number;
  discPct: number;
  batchNo: string;
  expiryDate: string;
  stockQty: number;
  mrp: number;
  sellingPrice: number;
  qty: number;
  isFree: boolean;
  isPrdm: boolean;
  controlledClass: ControlledClass;
}
