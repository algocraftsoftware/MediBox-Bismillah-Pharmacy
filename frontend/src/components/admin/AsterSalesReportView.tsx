"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export const AsterSalesReportView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [from, setFrom] = useState(toInputDate(new Date(new Date().setDate(1))));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [storeId, setStoreId] = useState<string>("");
  const [shift, setShift] = useState<string>("");
  const [cashierId, setCashierId] = useState<string>("");
  const [reportName, setReportName] = useState<SalesReportName>("DATE_WISE_SUMMARY");

  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);
  const [data, setData] = useState<SalesReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return <div className="py-16 text-center text-slate-400 font-bold text-sm">No records found for the selected filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300 whitespace-nowrap">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase">
            <th className="py-4 px-2 border border-slate-300 w-[5%] truncate">{refLabel}</th>
            <th className="py-4 px-2 border border-slate-300 w-[5%] truncate">Invoice Date</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] truncate">No of Inv.</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[3%] truncate">COGS</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Cur. COGS Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Prev. COGS Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Total Sales</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] truncate">Cur. Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] truncate">Prev. Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[3%] truncate">VAT</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Cur. VAT Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Prev. VAT Cxl</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[7%] truncate">Actual Total Sales</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Cur. Discount</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Prev. Discount</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] truncate">Net Sales</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Cur. Collection</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Prev. Collection</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] truncate">Cur. Refund</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[4%] truncate">Prev. Refund</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[5%] truncate">Net Collection</th>
            <th className="py-4 px-2 border border-slate-300 text-right w-[3%] truncate">Due</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {rows.map((r, i) =>
            r.isBanner ? (
              <tr key={i} className="bg-slate-50">
                <td colSpan={22} className="py-4 px-2 border border-slate-200 font-black text-slate-800 truncate">
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
                <td className="py-4 px-2 border border-slate-200 truncate">{r.isGroupHeader || r.isTotal ? r.key : r.invoiceNo}</td>
                <td className="py-4 px-2 border border-slate-200 truncate">{fmtDate(r.invoiceDate)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{r.noOfInv || ""}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.cogs)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.currentCogsCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.previousCogsCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.totalSales)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.currentCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.previousCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.vat)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.currentVatCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.previousVatCancel)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.actualTotalSales)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.currentDiscount)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.previousDiscount)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right font-black truncate">{fmt(r.netSales)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.currentCollection)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.previousCollection)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.currentRefund)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(r.previousRefund)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right font-black truncate">{fmt(r.netCollection)}</td>
                <td className="py-4 px-2 border border-slate-200 text-right text-red-600 font-black truncate">{fmt(r.due)}</td>
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
      <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[17%] truncate">Item Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[16%] truncate">Generic Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[14%] truncate">Department</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] truncate">Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] truncate">Discount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">VAT</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] truncate">Net Amount</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 font-bold truncate">{r.itemName}</td>
              <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.genericName}</td>
              <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.department}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.discountAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.vatAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-black truncate">{fmt(r.netAmount)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50 font-black border-t-2 border-emerald-200">
            <td className="py-4 px-3 border border-slate-200 truncate" colSpan={3}>
              Grand Total
            </td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{totals.qty}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.salesValue)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.cogs)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.discountAmount)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.vatAmount)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.netAmount)}</td>
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
      <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">Store</th>
            <th className="py-4 px-3 border border-slate-300 w-[12%] truncate">Invoice No</th>
            <th className="py-4 px-3 border border-slate-300 w-[12%] truncate">Invoice Date</th>
            <th className="py-4 px-3 border border-slate-300 w-[12%] truncate">Customer ID</th>
            <th className="py-4 px-3 border border-slate-300 w-[14%] truncate">Customer Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">Mobile</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] truncate">Net Sales</th>
            {showCollected && <th className="py-4 px-3 border border-slate-300 text-right w-[11%] truncate">Collected</th>}
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] truncate">Due</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r) => (
            <tr key={r.saleId} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 truncate">{r.storeName}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold truncate">{r.invoiceNo}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{fmtDate(r.invoiceDate)}</td>
              <td className="py-4 px-3 border border-slate-200 text-emerald-800 font-bold truncate">{r.customerCode}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.customerName}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.mobile}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.netSales)}</td>
              {showCollected && <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.collected)}</td>}
              <td className="py-4 px-3 border border-slate-200 text-right text-red-600 font-black truncate">{fmt(r.due)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50 font-black border-t-2 border-emerald-200">
            <td className="py-4 px-3 border border-slate-200 truncate" colSpan={6}>
              Total
            </td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.netSales)}</td>
            {showCollected && <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.collected)}</td>}
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.due)}</td>
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
      <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Sl.</th>
            <th className="py-4 px-3 border border-slate-300 w-[13%] truncate">User Name</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] truncate">No of Inv.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Cash</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Card</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Mobile</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Transfer</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[16%] truncate">Total Collection</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Refund</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[14%] truncate">Net Collection</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={r.cashierName} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 truncate">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold truncate">{r.cashierName}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.noOfInv}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.cash)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.card)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.mobile)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.transfer)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold truncate">{fmt(r.totalCollection)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.refund)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-black truncate">{fmt(r.netCollection)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50 font-black border-t-2 border-emerald-200">
            <td className="py-4 px-3 border border-slate-200 truncate" colSpan={2}>
              Total
            </td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{totals.noOfInv}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.cash)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.card)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.mobile)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.transfer)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.totalCollection)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.refund)}</td>
            <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(totals.netCollection)}</td>
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
    return <div className="py-16 text-center text-slate-400 font-bold text-sm">No records found for the selected filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            {showStore && <th className="py-4 px-3 border border-slate-300 w-[10%] truncate">Warehouse</th>}
            <th className="py-4 px-3 border border-slate-300 w-[17%] truncate">{groupLabel}</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Sales Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] truncate">Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] truncate">Discount Amt</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">VAT Amt</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] truncate">Net Amount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Profit</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Profit %</th>
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
              {showStore && <td className="py-4 px-3 border border-slate-200 truncate">{r.isSubTotal ? "" : r.storeName}</td>}
              <td className="py-4 px-3 border border-slate-200 truncate">{(r as any)[groupKey] || (r.isGrandTotal ? "Grand Total" : "")}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.discAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.vatAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.netAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.profit)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{pct(r.profitPctBefore)}</td>
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
      <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Sl</th>
            <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Vendor Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Dept. Name</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Sale Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Total COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[11%] truncate">Total Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Disc.(Tk)</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">VAT</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Net Amount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[12%] truncate">Gp(%) Before Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[12%] truncate">Gp(%) After Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[10%] truncate">Gross Profit(Tk)</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Net Profit(Tk)</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 truncate">{(page - 1) * PAGE_SIZE + i + 1}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold truncate">{r.supplierName || "—"}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.departmentName}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.discAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.vatAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.netAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{pct(r.profitPctBefore)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{pct(r.profitPctAfter)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold truncate">{fmt(r.salesValue - r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold truncate">{fmt(r.profit)}</td>
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
      <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-black uppercase whitespace-nowrap">
            <th className="py-4 px-3 border border-slate-300 w-[3%] truncate">Sl</th>
            {showInvoice && <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Invoice Date</th>}
            <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Warehouse</th>
            <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Vendor Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Item Code</th>
            <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Department</th>
            <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Sub Department</th>
            <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Item Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Generic Name</th>
            <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Dos. Form</th>
            <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Display Category</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">PP</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">MRP</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Sold Qty</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Total COGS</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Total Sales Value</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">VAT</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Net Amount</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">GP(%) Before Disc.</th>
            <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">GP(%) After Disc.</th>
          </tr>
        </thead>
        <tbody className="font-semibold whitespace-nowrap">
          {pageRows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
              <td className="py-4 px-3 border border-slate-200 truncate">{(page - 1) * PAGE_SIZE + i + 1}</td>
              {showInvoice && <td className="py-4 px-3 border border-slate-200 truncate">{fmtDate(r.invoiceDate || null)}</td>}
              <td className="py-4 px-3 border border-slate-200 truncate">{r.storeName}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.supplierName || "—"}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.itemCode || ""}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.departmentName}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.subDepartmentName || ""}</td>
              <td className="py-4 px-3 border border-slate-200 font-bold truncate">{r.itemName}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.genericName}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.dosageForm || ""}</td>
              <td className="py-4 px-3 border border-slate-200 truncate">{r.displayCategory || ""}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.ppPerPiece || 0)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.mrpPerPiece || 0)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.qty}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.cogs)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.salesValue)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.discAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.vatAmt)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right font-bold truncate">{fmt(r.netAmount)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{pct(r.profitPctBefore)}</td>
              <td className="py-4 px-3 border border-slate-200 text-right truncate">{pct(r.profitPctAfter)}</td>
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
