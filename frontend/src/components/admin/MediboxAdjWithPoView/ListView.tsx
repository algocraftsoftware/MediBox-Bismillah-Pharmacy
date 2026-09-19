"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { AdjWithPo } from "../../../types";
import { fmt } from "../../../lib/format";
import { PaginationBar } from "../PaginationBar";
import { ComboSelect } from "../ComboSelect";
import { DEBOUNCE_MS, LIST_PAGE_SIZE, statusLabel, VIA_OPTIONS, viaLabel } from "./types";
import { useSuppliers } from "../../../hooks/useShopLookups";
import { buildAdjWithPoReportHtml } from "./report";
import { ReportOverlay } from "../ReportOverlay";

export const ListView: React.FC<{
  api: ReturnType<typeof shopApi>;
  onNew: () => void;
  onEdit: (id: number) => void;
}> = ({ api, onNew, onEdit }) => {
  const { stores, shopName, logoUrl } = useShopSession();
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [rtvStoreId, setRtvStoreId] = useState("");
  const [via, setVia] = useState("");
  const [mode, setMode] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [adjStoreId, setAdjStoreId] = useState("");
  const [search, setSearch] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const suppliers = useSuppliers(api);

  const [rows, setRows] = useState<AdjWithPo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const runSearch = useCallback(
    (targetPage = 1) => {
      setLoading(true);
      setError(null);
      api
        .listAdjWithPo({
          status: status || undefined,
          rtvStoreId: rtvStoreId || undefined,
          storeId: adjStoreId || undefined,
          supplierId: supplierId || undefined,
          mode: mode || undefined,
          search: search || undefined,
          from: showDate ? from || undefined : undefined,
          to: showDate ? to || undefined : undefined,
          page: targetPage,
          pageSize: LIST_PAGE_SIZE,
        })
        .then((res) => {
          setRows(res.rows);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load adjustments"))
        .finally(() => setLoading(false));
    },
    [api, status, rtvStoreId, adjStoreId, supplierId, mode, search, showDate, from, to]
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(1), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, rtvStoreId, adjStoreId, supplierId, mode, search, showDate, from, to]);

  const handleClear = () => {
    setStatus("");
    setRtvStoreId("");
    setVia("");
    setMode("");
    setSupplierId("");
    setAdjStoreId("");
    setSearch("");
    setShowDate(false);
    setFrom("");
    setTo("");
  };

  // Per-row PDF — the same report the Detail screen prints, reachable straight
  // from the list. Shown in the in-app overlay, never a new browser tab.
  const handlePdf = async (id: number) => {
    setPdfLoadingId(id);
    setError(null);
    try {
      const a = await api.getAdjWithPo(id);
      const items = (a.items || []).map((it) => ({
        itemCode: it.product.externalCode,
        itemName: it.product.name,
        totalQtyPieces: it.totalQtyPieces,
        batchNo: it.batchNo || "",
        expiryDate: it.expiryDate ? it.expiryDate.split("T")[0] : "",
        tradePrice: it.tradePrice,
        totalValue: it.totalValue,
        vatAmt: it.vatAmt,
        discAmt: it.discAmt,
        mrp: it.mrp,
        netTotal: it.netTotal,
      }));
      const rtvLines = (a.rtvAdjustments || []).map((l) => ({
        rtvNo: l.rtv.rtvNo,
        rtvAmount: l.rtv.totalAmount,
        adjustmentAmount: l.adjustmentAmount,
      }));
      setReportHtml(
        buildAdjWithPoReportHtml({
          transactionNo: a.transactionNo,
          statusText: statusLabel(a.status),
          storeName: a.store?.name || "",
          storeAddress: a.store?.address,
          storePhone: a.store?.phone,
          supplierName: a.supplier?.name || "",
          orderNo: a.purchaseOrder?.orderNo,
          invoiceNo: a.invoiceNo,
          invoiceDate: a.invoiceDate ? a.invoiceDate.split("T")[0] : "",
          viaText: viaLabel(a.via),
          department: a.department,
          transactionDate: new Date(a.createdAt).toLocaleString(),
          remarks: a.remarks,
          shopName,
          logoUrl,
          items,
          rtvLines,
          totals: {
            totalTradeValue: a.totalTradeValue,
            totalVat: a.totalVat,
            totalDiscount: a.totalDiscount,
            rtvAdjustmentValue: a.rtvAdjustmentValue,
            netPayable: a.netAmount,
          },
          receivedByName: a.receivedBy?.name,
          createdByName: a.createdBy?.name,
          approvedByName: a.approvedBy?.name,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not build the report");
    } finally {
      setPdfLoadingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-6 gap-2.5 items-end text-xs mb-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Type</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">All</option>
              <option value="APPROVED">Approved</option>
              <option value="UNAPPROVED">Unapproved</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">RTV From</label>
            <select value={rtvStoreId} onChange={(e) => setRtvStoreId(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">All</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">RTV VIA</label>
            <select value={via} onChange={(e) => setVia(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">All</option>
              {VIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Department</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">All</option>
              <option value="PHARMA">Pharma</option>
              <option value="NON_PHARMA">Non-Pharma</option>
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
          <div>
            <label className="font-bold text-slate-700 block mb-1">ADJ Store</label>
            <select value={adjStoreId} onChange={(e) => setAdjStoreId(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">All</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-end gap-2.5">
            <div className="w-64">
              <label className="font-bold text-slate-700 block mb-1">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search By RTV No, GRN No"
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold text-xs"
              />
            </div>
            <button
              type="button"
              title="Filter by date range"
              onClick={() => setShowDate((v) => !v)}
              className={`shrink-0 border rounded p-1.5 ${
                showDate ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </button>
            {showDate && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 font-semibold text-xs" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 font-semibold text-xs" />
              </>
            )}
          </div>
          <div className="flex gap-2">
            {error && <p className="text-red-600 font-bold text-xs self-center mr-2">{error}</p>}
            <button onClick={handleClear} className="bg-[#dc2626] hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded text-xs">
              CLEAR
            </button>
            <button onClick={onNew} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 px-4 rounded text-xs">
              NEW
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">RTV From</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">RTV VIA</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Department</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] whitespace-nowrap">Supplier Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">RTV No</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">RTV Date</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">RTV Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">ADJ No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">ADJ Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">ADJ Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">ADJ Store</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">GRN No</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Invoice No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">GRN Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] whitespace-nowrap">Approve Date</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[6%] whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => {
              const lines = r.rtvAdjustments || [];
              const rtvNoLabel = lines.length === 0 ? "—" : lines.length === 1 ? lines[0].rtv.rtvNo : `${lines.length} RTVs`;
              const rtvDateLabel = lines.length === 1 ? new Date(lines[0].rtv.createdAt).toLocaleDateString() : "—";
              const rtvValueSum = lines.reduce((a, l) => a + l.adjustmentAmount, 0);
              const rtvFromLabel = lines.length === 1 ? stores.find((s) => s.id === lines[0].rtv.storeId)?.name || r.store?.name : r.store?.name;
              return (
                <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{rtvFromLabel}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{viaLabel(r.via)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.department || "—"}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.supplier?.name}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{rtvNoLabel}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{rtvDateLabel}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(rtvValueSum)}</td>
                  <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 whitespace-nowrap">{r.transactionNo}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 whitespace-nowrap">{fmt(r.rtvAdjustmentValue)}</td>
                  <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded font-bold ${r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.store?.name}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.transactionNo}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.invoiceNo}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.netAmount)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}</td>
                  <td className="py-4 px-3 border border-slate-200 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => onEdit(r.id)} className="text-blue-600 hover:text-blue-800 font-bold underline">
                        Edit
                      </button>
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
                          title="No purchase invoice was uploaded against this adjustment"
                        >
                          Invoice
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={16} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : (
                    "No Adjust With PO records found."
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
