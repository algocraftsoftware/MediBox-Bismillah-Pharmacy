"use client";

import React, { useMemo, useState } from "react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import {
  DueReportRow,
  ItemWiseReportRow,
  ProfitReportRow,
  SalesLedgerRow,
  SalesReportName,
  SalesReportResponse,
  UserCollectionSummaryRow,
} from "../../types";
import { fmt } from "../../lib/format";
import { PaginationBar } from "./PaginationBar";
import { useAdmins } from "../../hooks/useShopLookups";

const PAGE_SIZE = 10;

const REPORT_NAMES: { value: SalesReportName; label: string }[] = [
  { value: "INVOICE_WISE_DETAILS", label: "Invoice Wise Details" },
  { value: "PHARMACY_WISE_SUMMARY", label: "Pharmacy wise Summary" },
  { value: "ITEM_WISE_DETAILS", label: "Item Wise Details" },
  { value: "PHARMACY_CANCEL_SUMMARY", label: "Pharmacy Cancel Summary Report" },
  { value: "PHARMACY_CANCEL_DETAILS", label: "Pharmacy Cancel Details Report" },
  { value: "PHARMACY_DUE_DETAILS", label: "Pharmacy Due Details" },
  { value: "USER_WISE_COLL_SUMMARY", label: "User Wise Coll.Summary" },
  { value: "DUE_COLLECTION_DETAILS", label: "Due Collection Details" },
  { value: "DATE_WISE_SUMMARY", label: "Date Wise Summary" },
  { value: "DATE_WISE_DETAILS", label: "Date Wise Details" },
  { value: "USER_WISE_DETAILS", label: "User Wise Details" },
];

const PROFIT_REPORT_NAMES: { value: SalesReportName; label: string }[] = [
  { value: "PROFIT_DEPT_SUMMARY", label: "Department Wise Summary" },
  { value: "PROFIT_SUBDEPT_SUMMARY", label: "Sub-Department Wise Summary" },
  { value: "PROFIT_ITEM_WISE", label: "Item Wise Sales Report" },
  { value: "PROFIT_SUPPLIER_SUMMARY", label: "Supplier Wise Summary" },
  { value: "PROFIT_SUPPLIER_TOP_SHEET", label: "Supplier Wise Top Sheet" },
  { value: "PROFIT_SUPPLIER_DETAILS", label: "Supplier Wise Details" },
];

// First-column header per report type — group/total rows show their group
// key here (a date, a store name, a user name, "Total ="/"Grand Total"...);
// leaf invoice rows show their invoice number instead.
const REF_LABEL: Partial<Record<SalesReportName, string>> = {
  INVOICE_WISE_DETAILS: "Invoice No",
  PHARMACY_WISE_SUMMARY: "Store Name",
  DATE_WISE_SUMMARY: "Invoice Date",
  DATE_WISE_DETAILS: "Invoice No",
  USER_WISE_DETAILS: "Invoice No",
  PHARMACY_CANCEL_SUMMARY: "Store Name",
  PHARMACY_CANCEL_DETAILS: "Invoice No",
};

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "");

export const MediboxSalesReportView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  // Both dates open on today. The report is read far more often for "what has
  // happened so far today" than for the month to date, and a month-wide default
  // meant every such check started by correcting the From Date.
  const [from, setFrom] = useState(toInputDate(new Date()));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [storeId, setStoreId] = useState<string>("");
  const [shift, setShift] = useState<string>("");
  const [cashierId, setCashierId] = useState<string>("");
  const [reportName, setReportName] = useState<SalesReportName>("DATE_WISE_SUMMARY");

  const admins = useAdmins(api);
  const [data, setData] = useState<SalesReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const runReport = () => {
    setLoading(true);
    setError(null);
    api
      .getSalesReport({ reportName, storeId: storeId || undefined, shift: shift || undefined, cashierId: cashierId || undefined, from, to })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load report"))
      .finally(() => setLoading(false));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportSalesReport({ reportName, storeId: storeId || undefined, shift: shift || undefined, cashierId: cashierId || undefined, from, to });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const storeName = storeId ? stores.find((s) => String(s.id) === storeId)?.name || "" : "All Store";
  const refLabel = REF_LABEL[reportName] || "Ref";

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-4 gap-2.5 items-end text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">To Date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pharmacy Name</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">All Store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Report Name</label>
            <select
              value={REPORT_NAMES.some((r) => r.value === reportName) ? reportName : ""}
              onChange={(e) => setReportName(e.target.value as SalesReportName)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="" disabled>
                Select...
              </option>
              {REPORT_NAMES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mt-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Shift Name</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">&lt; All Shift &gt;</option>
              <option value="MORNING">Morning (07:00 - 15:00)</option>
              <option value="EVENING">Evening (15:00 - 24:00)</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User Name</label>
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">&lt; All User &gt;</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pharmacy Sales Report (Profit)</label>
            <select
              value={PROFIT_REPORT_NAMES.some((r) => r.value === reportName) ? reportName : ""}
              onChange={(e) => setReportName(e.target.value as SalesReportName)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="" disabled>
                Select...
              </option>
              {PROFIT_REPORT_NAMES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={runReport}
              disabled={loading}
              className="bg-[#0891b2] hover:bg-cyan-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded shadow"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner size="xs" variant="white" /> LOADING...
                </span>
              ) : (
                "SHOW REPORT"
              )}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-50 text-slate-900 hover:text-white font-bold px-5 py-2 rounded shadow"
            >
              {exporting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner size="xs" /> EXPORTING...
                </span>
              ) : (
                "EXCEL"
              )}
            </button>
          </div>
        </div>
        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!data && !loading && (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            Select filters above and click SHOW REPORT.
          </div>
        )}

        {data && (
          <div className="bg-white border border-slate-300 rounded shadow-sm">
            <div className="p-4 border-b border-slate-200">
              <p className="font-black text-slate-900 text-sm">
                Pharmacy Sales Report — {[...REPORT_NAMES, ...PROFIT_REPORT_NAMES].find((r) => r.value === reportName)?.label}
              </p>
              <p className="text-xs text-slate-500 font-semibold">
                {storeName} | From Date : {fmtDate(from)} &nbsp; To Date : {fmtDate(to)}
              </p>
            </div>

            {data.ledgerRows && <LedgerTable rows={data.ledgerRows} refLabel={refLabel} />}
            {data.itemRows && <ItemWiseTable rows={data.itemRows} />}
            {data.dueRows && <DueTable rows={data.dueRows} showCollected={reportName === "DUE_COLLECTION_DETAILS"} />}
            {data.collectionRows && <CollectionTable rows={data.collectionRows} />}
            {data.profitRows && <ProfitReportTable reportName={reportName} rows={data.profitRows} />}
          </div>
        )}
      </div>
    </div>
  );
};

const LedgerTable: React.FC<{ rows: SalesLedgerRow[]; refLabel: string }> = ({ rows, refLabel }) => {
  if (rows.length === 0) {
    return <div className="overflow-x-auto py-16 text-center text-slate-400 font-bold text-sm">No records found for the selected filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm border border-slate-300 whitespace-nowrap">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase">
            <th className="py-4 px-2 border border-slate-300 w-[5%] whitespace-nowrap">{refLabel}</th>
            <th className="py-4 px-2 border border-slate-300 w-[5%] whitespace-nowrap">Invoice Date</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] whitespace-nowrap">No of Inv.</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[3%] whitespace-nowrap">COGS</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Cur. COGS Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Prev. COGS Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Total Sales</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] whitespace-nowrap">Cur. Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] whitespace-nowrap">Prev. Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[3%] whitespace-nowrap">VAT</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Cur. VAT Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Prev. VAT Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[7%] whitespace-nowrap">Actual Total Sales</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Cur. Discount</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Prev. Discount</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] whitespace-nowrap">Net Sales</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Cur. Collection</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Prev. Collection</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] whitespace-nowrap">Cur. Refund</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] whitespace-nowrap">Prev. Refund</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] whitespace-nowrap">Net Collection</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[3%] whitespace-nowrap">Due</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {rows.map((r, i) =>
            r.isBanner ? (
              <tr key={i} className="bg-slate-50">
                <td colSpan={22} className="py-4 px-2 border border-slate-200 font-black text-slate-800 whitespace-nowrap">
                  {r.key}
                </td>
              </tr>
            ) : (
              <tr
                key={i}
                className={
                  r.isTotal
                    ? "bg-emerald-50 font-black border-t-2 border-emerald-200"
                    : r.isGroupHeader
                    ? "bg-slate-50 font-bold"
                    : "odd:bg-white even:bg-slate-50 hover:bg-slate-100"
                }
              >
                <td className="py-4 px-2 border border-slate-200 whitespace-nowrap">{r.isGroupHeader || r.isTotal ? r.key : r.invoiceNo}</td>
                <td className="py-4 px-2 border border-slate-200 whitespace-nowrap">{fmtDate(r.invoiceDate)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{r.noOfInv || ""}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.cogs)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.currentCogsCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.previousCogsCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.totalSales)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.currentCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.previousCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.vat)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.currentVatCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.previousVatCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.actualTotalSales)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.currentDiscount)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.previousDiscount)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right font-black whitespace-nowrap">{fmt(r.netSales)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.currentCollection)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.previousCollection)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.currentRefund)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right whitespace-nowrap">{fmt(r.previousRefund)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right font-black whitespace-nowrap">{fmt(r.netCollection)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right text-red-600 font-black whitespace-nowrap">{fmt(r.due)}</td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};

const ItemWiseTable: React.FC<{ rows: ItemWiseReportRow[] }> = ({ rows }) => {
  const [page, setPage] = useState(1);
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
  }
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          qty: acc.qty + r.qty,
          salesValue: acc.salesValue + r.salesValue,
          cogs: acc.cogs + r.cogs,
          discountAmount: acc.discountAmount + r.discountAmount,
          vatAmount: acc.vatAmount + r.vatAmount,
          netAmount: acc.netAmount + r.netAmount,
        }),
        { qty: 0, salesValue: 0, cogs: 0, discountAmount: 0, vatAmount: 0, netAmount: 0 }
      ),
    [rows]
  );
  if (rows.length === 0) {
    return <div className="py-16 text-center text-slate-400 font-bold text-sm">No records found for the selected filters.</div>;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[17%] whitespace-nowrap">Item Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[16%] whitespace-nowrap">Generic Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[14%] whitespace-nowrap">Department</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] whitespace-nowrap">Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] whitespace-nowrap">Discount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">VAT</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] whitespace-nowrap">Net Amount</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 font-bold whitespace-nowrap">{r.itemName}</td>
              <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.genericName}</td>
              <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.department}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.discountAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.vatAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-black whitespace-nowrap">{fmt(r.netAmount)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50 font-black border-t-2 border-emerald-200">
            <td className="py-4 px-3 border border-slate-200 whitespace-nowrap" colSpan={3}>
              Grand Total
            </td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{totals.qty}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.salesValue)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.cogs)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.discountAmount)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.vatAmount)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.netAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      page={page}
      totalPages={totalPages}
      total={rows.length}
      onFirst={() => setPage(1)}
      onPrevious={() => setPage((p) => Math.max(1, p - 1))}
      onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      onLast={() => setPage(totalPages)}
      onPageChange={setPage}
    />
    </div>
  );
};

const DueTable: React.FC<{ rows: DueReportRow[]; showCollected: boolean }> = ({ rows, showCollected }) => {
  const [page, setPage] = useState(1);
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
  }
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({ netSales: acc.netSales + r.netSales, collected: acc.collected + r.collected, due: acc.due + r.due }),
        { netSales: 0, collected: 0, due: 0 }
      ),
    [rows]
  );
  if (rows.length === 0) {
    return <div className="py-16 text-center text-slate-400 font-bold text-sm">No outstanding dues for the selected filters.</div>;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Store</th>
            <th className="py-4 px-3 border border-slate-300 w-[12%] whitespace-nowrap">Invoice No</th>
            <th className="py-4 px-3 border border-slate-300 w-[12%] whitespace-nowrap">Invoice Date</th>
            <th className="py-4 px-3 border border-slate-300 w-[12%] whitespace-nowrap">Customer ID</th>
            <th className="py-4 px-3 border border-slate-300 w-[14%] whitespace-nowrap">Customer Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Mobile</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] whitespace-nowrap">Net Sales</th>
            {showCollected && <th className="py-4 px-3 border border-slate-300 text-right w-[11%] whitespace-nowrap">Collected</th>}
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] whitespace-nowrap">Due</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r) => (
            <tr key={r.saleId} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.storeName}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold whitespace-nowrap">{r.invoiceNo}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{fmtDate(r.invoiceDate)}</td>
              <td className="py-4 px-3 border border-slate-200 text-emerald-800 font-bold whitespace-nowrap">{r.customerCode}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.customerName}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.mobile}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.netSales)}</td>
              {showCollected && <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.collected)}</td>}
              <td className="py-4 px-3 border border-slate-200 text-right text-red-600 font-black whitespace-nowrap">{fmt(r.due)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50 font-black border-t-2 border-emerald-200">
            <td className="py-4 px-3 border border-slate-200 whitespace-nowrap" colSpan={6}>
              Total
            </td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.netSales)}</td>
            {showCollected && <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.collected)}</td>}
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.due)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      page={page}
      totalPages={totalPages}
      total={rows.length}
      onFirst={() => setPage(1)}
      onPrevious={() => setPage((p) => Math.max(1, p - 1))}
      onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      onLast={() => setPage(totalPages)}
      onPageChange={setPage}
    />
    </div>
  );
};

const CollectionTable: React.FC<{ rows: UserCollectionSummaryRow[] }> = ({ rows }) => {
  const [page, setPage] = useState(1);
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
  }
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          noOfInv: acc.noOfInv + r.noOfInv,
          cash: acc.cash + r.cash,
          card: acc.card + r.card,
          mobile: acc.mobile + r.mobile,
          transfer: acc.transfer + r.transfer,
          totalCollection: acc.totalCollection + r.totalCollection,
          refund: acc.refund + r.refund,
          netCollection: acc.netCollection + r.netCollection,
        }),
        { noOfInv: 0, cash: 0, card: 0, mobile: 0, transfer: 0, totalCollection: 0, refund: 0, netCollection: 0 }
      ),
    [rows]
  );
  if (rows.length === 0) {
    return <div className="py-16 text-center text-slate-400 font-bold text-sm">No collections found for the selected filters.</div>;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Sl.</th>
            <th className="py-4 px-3 border border-slate-300 w-[13%] whitespace-nowrap">User Name</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] whitespace-nowrap">No of Inv.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">Cash</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">Card</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] whitespace-nowrap">Mobile</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] whitespace-nowrap">Transfer</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[16%] whitespace-nowrap">Total Collection</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">Refund</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[14%] whitespace-nowrap">Net Collection</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={r.cashierName} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold whitespace-nowrap">{r.cashierName}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{r.noOfInv}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.cash)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.card)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.mobile)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.transfer)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold whitespace-nowrap">{fmt(r.totalCollection)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.refund)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-black whitespace-nowrap">{fmt(r.netCollection)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50 font-black border-t-2 border-emerald-200">
            <td className="py-4 px-3 border border-slate-200 whitespace-nowrap" colSpan={2}>
              Total
            </td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{totals.noOfInv}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.cash)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.card)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.mobile)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.transfer)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.totalCollection)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.refund)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(totals.netCollection)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      page={page}
      totalPages={totalPages}
      total={rows.length}
      onFirst={() => setPage(1)}
      onPrevious={() => setPage((p) => Math.max(1, p - 1))}
      onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      onLast={() => setPage(totalPages)}
      onPageChange={setPage}
    />
    </div>
  );
};

const pct = (n: number | undefined) => `${(n ?? 0).toFixed(2)}%`;

// Dept/Sub-Dept/Supplier Wise Summary — grouped rows with Sub-Total (per
// store, where applicable) and a final Grand Total, mirroring the reference
// report's layout.
const ProfitSummaryTable: React.FC<{ rows: ProfitReportRow[]; groupLabel: string; showStore: boolean; groupKey: "departmentName" | "subDepartmentName" | "supplierName" }> = ({
  rows,
  groupLabel,
  showStore,
  groupKey,
}) => {
  if (rows.length === 0) {
    return <div className="overflow-x-auto py-16 text-center text-slate-400 font-bold text-sm">No records found for the selected filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            {showStore && <th className="py-4 px-3 border border-slate-300 w-[10%] whitespace-nowrap">Warehouse</th>}
            <th className="py-4 px-3 border border-slate-300 w-[17%] whitespace-nowrap">{groupLabel}</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] whitespace-nowrap">Sales Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] whitespace-nowrap">Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] whitespace-nowrap">Discount Amt</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">VAT Amt</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] whitespace-nowrap">Net Amount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">Profit</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] whitespace-nowrap">Profit %</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {rows.map((r, i) => (
            <tr
              key={i}
              className={
                r.isGrandTotal
                  ? "bg-emerald-100 font-black"
                  : r.isSubTotal
                  ? "bg-slate-50 font-bold"
                  : "odd:bg-white even:bg-slate-50 hover:bg-slate-100"
              }
            >
              {showStore && <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.isSubTotal ? "" : r.storeName}</td>}
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{(r as any)[groupKey] || (r.isGrandTotal ? "Grand Total" : "")}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.discAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.vatAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.netAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.profit)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{pct(r.profitPctBefore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Supplier Wise Top Sheet — one row per (Supplier, Department), with both
// Gross Profit (before discount) and Net Profit (after discount) GP%.
const ProfitTopSheetTable: React.FC<{ rows: ProfitReportRow[] }> = ({ rows }) => {
  const [page, setPage] = useState(1);
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
  }
  if (rows.length === 0) {
    return <div className="py-16 text-center text-slate-400 font-bold text-sm">No records found for the selected filters.</div>;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[4%] whitespace-nowrap">Sl</th>
            <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Vendor Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Dept. Name</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">Sale Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">Total COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] whitespace-nowrap">Total Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">Disc.(Tk)</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[4%] whitespace-nowrap">VAT</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">Net Amount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[12%] whitespace-nowrap">Gp(%) Before Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[12%] whitespace-nowrap">Gp(%) After Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] whitespace-nowrap">Gross Profit(Tk)</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] whitespace-nowrap">Net Profit(Tk)</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold whitespace-nowrap">{r.supplierName || "—"}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.departmentName}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.discAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.vatAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.netAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{pct(r.profitPctBefore)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{pct(r.profitPctAfter)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold whitespace-nowrap">{fmt(r.salesValue - r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold whitespace-nowrap">{fmt(r.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <PaginationBar
      page={page}
      totalPages={totalPages}
      total={rows.length}
      onFirst={() => setPage(1)}
      onPrevious={() => setPage((p) => Math.max(1, p - 1))}
      onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      onLast={() => setPage(totalPages)}
      onPageChange={setPage}
    />
    </div>
  );
};

// Item Wise Sales Report / Supplier Wise Details — one row per sold line
// item, with full item/pricing detail.
const ProfitDetailTable: React.FC<{ rows: ProfitReportRow[]; showInvoice: boolean }> = ({ rows, showInvoice }) => {
  const [page, setPage] = useState(1);
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
  }
  if (rows.length === 0) {
    return <div className="py-16 text-center text-slate-400 font-bold text-sm">No records found for the selected filters.</div>;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[3%] whitespace-nowrap">Sl</th>
            {showInvoice && <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Invoice Date</th>}
            <th className="py-4 px-3 border border-slate-300 w-[4%] whitespace-nowrap">Warehouse</th>
            <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Vendor Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[4%] whitespace-nowrap">Item Code</th>
            <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Department</th>
            <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">Sub Department</th>
            <th className="py-4 px-3 border border-slate-300 w-[4%] whitespace-nowrap">Item Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Generic Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[4%] whitespace-nowrap">Dos. Form</th>
            <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Display Category</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] whitespace-nowrap">PP</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] whitespace-nowrap">MRP</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[4%] whitespace-nowrap">Sold Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">Total COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">Total Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] whitespace-nowrap">Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] whitespace-nowrap">VAT</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">Net Amount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">GP(%) Before Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">GP(%) After Disc.</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{(page - 1) * PAGE_SIZE + i + 1}</td>
              {showInvoice && <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{fmtDate(r.invoiceDate || null)}</td>}
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.storeName}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.supplierName || "—"}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.itemCode || ""}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.departmentName}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.subDepartmentName || ""}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold whitespace-nowrap">{r.itemName}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.genericName}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.dosageForm || ""}</td>
              <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">{r.displayCategory || ""}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.ppPerPiece || 0)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.mrpPerPiece || 0)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.discAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.vatAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold whitespace-nowrap">{fmt(r.netAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{pct(r.profitPctBefore)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{pct(r.profitPctAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <PaginationBar
      page={page}
      totalPages={totalPages}
      total={rows.length}
      onFirst={() => setPage(1)}
      onPrevious={() => setPage((p) => Math.max(1, p - 1))}
      onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      onLast={() => setPage(totalPages)}
      onPageChange={setPage}
    />
    </div>
  );
};

const ProfitReportTable: React.FC<{ reportName: SalesReportName; rows: ProfitReportRow[] }> = ({ reportName, rows }) => {
  if (reportName === "PROFIT_DEPT_SUMMARY") {
    return <ProfitSummaryTable rows={rows} groupLabel="Department Name" showStore groupKey="departmentName" />;
  }
  if (reportName === "PROFIT_SUBDEPT_SUMMARY") {
    return <ProfitSummaryTable rows={rows} groupLabel="Sub Department Name" showStore={false} groupKey="subDepartmentName" />;
  }
  if (reportName === "PROFIT_SUPPLIER_SUMMARY") {
    return <ProfitSummaryTable rows={rows} groupLabel="Vendor Name" showStore groupKey="supplierName" />;
  }
  if (reportName === "PROFIT_SUPPLIER_TOP_SHEET") {
    return <ProfitTopSheetTable rows={rows} />;
  }
  // PROFIT_ITEM_WISE / PROFIT_SUPPLIER_DETAILS
  return <ProfitDetailTable rows={rows} showInvoice={reportName === "PROFIT_ITEM_WISE"} />;
};
