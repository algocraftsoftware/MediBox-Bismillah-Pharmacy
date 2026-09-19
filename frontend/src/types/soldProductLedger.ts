import { CustomerType } from "./core";

export interface SoldLedgerRow {
  store: string;
  invoiceNo: string;
  invoiceDate: string;
  customerId: string | null;
  customerName: string | null;
  contactNo: string | null;
  custType: CustomerType | null;
  eidPfNo: string | null;
  itemName: string;
  batchNo: string;
  qty: number;
  mrp: number;
  totalValue: number;
  remarks: string | null;
  company: string | null;
  grnNo: string | null;
  companyInvoiceNo: string | null;
  servedBy: string;
}

export interface SoldLedgerResponse {
  rows: SoldLedgerRow[];
  total: number;
  page: number;
  pageSize: number;
}
