"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Grn } from "../../../types";
import { fmt } from "../../../lib/format";
import { PaginationBar } from "../PaginationBar";
import { ComboSelect } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { DEBOUNCE_MS, LIST_PAGE_SIZE, statusLabel } from "./types";
import { buildGrnwReportHtml } from "./report";
import { useSuppliers } from "../../../hooks/useShopLookups";

export const ListView: React.FC<{
  api: ReturnType<typeof shopApi>;
  onNew: () => void;
  onEdit: (id: number) => void;
}> = ({ api, onNew, onEdit }) => {
  const { stores, shopName, logoUrl, adminName } = useShopSession();
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [date, setDate] = useState("");
  const suppliers = useSuppliers(api);

  const [rows, setRows] = useState<Grn[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);


  const handlePdf = async (id: number) => {
    setPdfLoadingId(id);
    try {
      const g = await api.getGrnw(id);
      const items = (g.items || []).map((it) => ({
        itemCode: it.product.externalCode,
        itemName: it.product.name,
        batchNo: it.batchNo,
        rcvQtyBox: it.rcvQtyBox,
        rcvQtyPieces: it.rcvQtyPieces,
        bonusQtyPieces: it.bonusQtyPieces,
        tradePrice: it.tradePrice,
        totalValue: it.totalValue,
        vatAmt: it.vatAmt,
        discAmt: it.discAmt,
        mrp: it.mrp,
        gpPct: it.gpPct,
        netTotal: it.netTotal,
      }));
      setReportHtml(
        buildGrnwReportHtml({
          grn: g,
          shopName,
          logoUrl,
          adminName,
          items,
          totals: {
            totalTradeValue: g.totalTradeValue,
            totalVat: g.totalVat,
            totalDiscount: g.totalDiscount,
            netAmount: g.netAmount,
          },
          invoiceDiscount: g.invoiceDiscount,
          invoiceVat: g.invoiceVat,
          expiryAdjustmentAmount: g.expiryAdjustmentAmount,
        })
      );
    } catch {
      setError("Failed to load GRN for report");
    } finally {
      setPdfLoadingId(null);
    }
  };

  const runSearch = useCallback(
    (targetPage = 1) => {
      setLoading(true);
      setError(null);
      api
        .listGrnw({
          status: status || undefined,
          storeId: storeId || undefined,
          supplierId: supplierId || undefined,
          search: search || undefined,
          date: date || undefined,
          page: targetPage,
          pageSize: LIST_PAGE_SIZE,
        })
        .then((res) => {
          setRows(res.rows);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load GRNs"))
        .finally(() => setLoading(false));
    },
    [api, status, storeId, supplierId, search, date]
  );

  // Filters auto-apply — no explicit Search button. This also fires once on
  // mount (with default/empty filters) so records show up immediately,
  // including a GRN you just submitted and got sent back to the list from.
  useEffect(() => {
    const t = setTimeout(() => runSearch(1), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, storeId, supplierId, search, date]);

  const handleClear = () => {
    setStatus("");
    setStoreId("");
    setSupplierId("");
    setSearch("");
    setDate("");
    setShowDate(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-6 gap-2.5 items-end text-xs mb-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Type</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">All</option>
              <option value="APPROVED">Approved</option>
              <option value="UNAPPROVED">Unapproved</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">All</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier</label>
            <ComboSelect
              value={supplierId}
              onChange={setSupplierId}
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="All"
            />
          </div>
          <div className="col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="GRN or Invoice No..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              title="Filter by date"
              onClick={() => setShowDate((v) => !v)}
              className={`shrink-0 border rounded p-1.5 ${
                showDate ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </button>
            {showDate && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
              />
            )}
          </div>
        </div>
        <div className="flex justify-between items-center">
          {error && <p className="text-red-600 font-bold text-xs">{error}</p>}
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={handleClear}
              className="bg-[#dc2626] hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded text-xs"
            >
              CLEAR FILTER
            </button>
            <button
              onClick={onNew}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 px-4 rounded text-xs"
            >
              NEW
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Transaction No</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Trans. Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Store Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[10%] whitespace-nowrap">Supplier Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Supplier Invoice</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Approved By</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Approve Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">User</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">Avg.GP(%)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">Net Amount</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[5%] whitespace-nowrap"></th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[4%] whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 whitespace-nowrap">{r.transactionNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.supplier?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.invoiceNo}</td>
                <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      r.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.status === "CANCELED"
                        ? "bg-slate-200 text-slate-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.approvedBy?.name || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.createdBy?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{r.avgGpPct.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 whitespace-nowrap">{fmt(r.netAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center whitespace-nowrap">
                  <button onClick={() => onEdit(r.id)} className="text-blue-600 hover:text-blue-800 font-bold underline">
                    Edit
                  </button>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => handlePdf(r.id)}
                      disabled={pdfLoadingId === r.id}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[10px] font-bold px-1.5 py-0.5 rounded"
                      title="View / Print Report"
                    >
                      {pdfLoadingId === r.id ? "..." : "PDF"}
                    </button>
                    {/* Only offered when something was actually attached — a
                        button that opens nothing would be worse than none. */}
                    {r.attachmentUrl ? (
                      <a
                        href={r.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded"
                        title="View the uploaded purchase invoice"
                      >
                        Invoice
                      </a>
                    ) : (
                      <span
                        className="text-slate-300 text-[10px] font-bold px-1.5 py-0.5"
                        title="No purchase invoice was uploaded against this GRN"
                      >
                        Invoice
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : (
                    "No GRN records found."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        onFirst={() => runSearch(1)}
        onPrevious={() => runSearch(page - 1)}
        onNext={() => runSearch(page + 1)}
        onLast={() => runSearch(totalPages)}
        onPageChange={runSearch}
      />
      <ReportOverlay html={reportHtml} onClose={() => setReportHtml(null)} />
    </div>
  );
};
