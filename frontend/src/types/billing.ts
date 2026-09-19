import { ControlledClass } from "./core";

// A search result row: one row per batch (what's actually sellable), joined
// with its product/department/supplier info — this is what the Billing
// item-search combobox returns.
export interface BatchSearchResult {
  batchId: number;
<<<<<<< HEAD
  // Null for goods received without a batch number or expiry date — the
  // server does not pass on the placeholder it generates internally.
  batchNo: string | null;
  expiryDate: string | null;
=======
  batchNo: string;
  expiryDate: string;
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
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
<<<<<<< HEAD
  // Null for goods received without a batch number or expiry date — the
  // server does not pass on the placeholder it generates internally.
  batchNo: string | null;
  expiryDate: string | null;
=======
  batchNo: string;
  expiryDate: string;
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  stockQty: number;
  mrp: number;
  sellingPrice: number;
  qty: number;
  isFree: boolean;
  isPrdm: boolean;
  controlledClass: ControlledClass;
}
