"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calendar, Search } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { PurchaseOrder, Supplier } from "../../../types";
import { fmt } from "../../../lib/format";
import { PaginationBar } from "../PaginationBar";
import { ReportOverlay } from "../ReportOverlay";
import { ComboSelect } from "../ComboSelect";
import { LIST_PAGE_SIZE, statusLabel } from "./types";
import { buildPoReportHtml } from "./report";

export const ListView: React.FC<{
  api: ReturnType<typeof shopApi>;
  onEdit: (id: number) => void;
}> = ({ api, onEdit }) => {
  const { stores, shopName, logoUrl, preparedBySignatureUrl, reviewedBySignatureUrl, approvedBySignatureUrl, shopAddress, shopPhone } = useShopSession();
  const [poStatus, setPoStatus] = useState("");
  const [reqMode, setReqMode] = useState("");
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);

  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(
    (targetPage = 1) => {
      setLoading(true);
      setError(null);
      api
        .listPurchaseOrders({
          poStatus: poStatus || undefined,
          mode: reqMode || undefined,
          storeId: storeId || undefined,
          supplierId: supplierId || undefined,
          userId: userId || undefined,
          search: search || undefined,
          from: from || undefined,
          to: to || undefined,
          page: targetPage,
          pageSize: LIST_PAGE_SIZE,
        })
        .then((res) => {
          setRows(res.rows);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load purchase orders"))
        .finally(() => setLoading(false));
    },
    [api, poStatus, reqMode, storeId, supplierId, userId, search, from, to]
  );

  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = () => {
    setPoStatus("");
    setReqMode("");
    setStoreId("");
    setSupplierId("");
    setUserId("");
    setSearch("");
    setFrom("");
    setTo("");
    setShowDate(false);
    setTimeout(() => runSearch(1), 0);
  };

  const handlePrint = async (order: PurchaseOrder) => {
    // The list row doesn't carry items (kept off the list query for speed) —
    // fetch the full order first so this renders the exact same report as
    // the Detail page's REPORT button, not an item-less one.
    setPdfLoadingId(order.id);
    setError(null);
    try {
      const full = await api.getPurchaseOrder(order.id);
      setReportHtml(
        buildPoReportHtml({
          order: full,
          shopName,
          logoUrl,
          preparedBySignatureUrl,
          reviewedBySignatureUrl,
          approvedBySignatureUrl,
          shopAddress,
          shopPhone,
        })
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load order for report");
    } finally {
      setPdfLoadingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-5 gap-2.5 items-end text-xs mb-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Type</label>
            <select
              value={poStatus}
              onChange={(e) => setPoStatus(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="DONE">Done</option>
              <option value="PENDING_TO_GRN">Pending to GRN</option>
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
          <div>
            <label className="font-bold text-slate-700 block mb-1">Req. Mode</label>
            <select
              value={reqMode}
              onChange={(e) => setReqMode(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select Req. Mode</option>
              <option value="PHARMA">Pharma</option>
              <option value="NON_PHARMA">Non-Pharma</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <div className="flex gap-1.5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
                placeholder="Please Search Order No.."
                className="flex-1 border border-slate-300 rounded px-2 py-1.5 font-semibold min-w-0"
              />
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
            </div>
          </div>
        </div>
        {showDate && (
          <div className="grid grid-cols-5 gap-2.5 items-end text-xs mt-2.5">
            <div>
              <label className="font-bold text-slate-700 block mb-1">From Date</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">To Date</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
            </div>
          </div>
        )}
        <div className="grid grid-cols-5 gap-2.5 items-end text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">User</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select...</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-3" />
          <div className="flex gap-2">
            <button
              onClick={() => runSearch(1)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              SEARCH
            </button>
            <button
              onClick={handleClear}
              className="flex-1 bg-[#dc2626] hover:bg-red-700 text-white font-bold py-1.5 rounded"
            >
              CLEAR
            </button>
            <button
              onClick={() => runSearch(1)}
              className="flex-1 bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold py-1.5 rounded"
            >
              NEW
            </button>
          </div>
        </div>
        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Order No.</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Order Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Store Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[11%] truncate">For Store Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[10%] truncate">Supplier Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Req.Mode</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Approved By</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">Approve Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">User</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Avg.GP(%)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Total Amt.</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[10%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.orderNo || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.deliverToStore?.name || r.deliverTo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.supplier?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.mode === "PHARMA" ? "Pharma" : "Non-Pharma"}</td>
                <td className="py-4 px-3 border border-slate-200 truncate">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      r.status === "FINAL_APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.finalApprovedBy?.name || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">
                  {r.finalApprovedAt ? new Date(r.finalApprovedAt).toLocaleString() : "—"}
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.createdBy?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.avgGpPct.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(r.totalPPAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => onEdit(r.id)}
                      className="text-blue-600 hover:text-blue-800 font-bold underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handlePrint(r)}
                      disabled={pdfLoadingId === r.id}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[10px] font-bold px-1.5 py-0.5 rounded"
                      title="Download PDF"
                    >
                      {pdfLoadingId === r.id ? "..." : "PDF"}
                    </button>
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
                    "No purchase orders found."
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
