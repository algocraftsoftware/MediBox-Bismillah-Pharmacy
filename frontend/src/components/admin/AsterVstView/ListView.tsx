"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calendar, FileDown, FileText } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Supplier, Vst } from "../../../types";
import { fmt, fmt4 } from "../../../lib/format";
import { amountInWords } from "../../../lib/numberToWords";
import { PaginationBar } from "../PaginationBar";
import { ReportOverlay } from "../ReportOverlay";
import { ComboSelect } from "../ComboSelect";
import { LIST_PAGE_SIZE, DEBOUNCE_MS, statusLabel } from "./types";

export const ListView: React.FC<{
  api: ReturnType<typeof shopApi>;
  onNew: () => void;
  onEdit: (id: number) => void;
}> = ({ api, onNew, onEdit }) => {
  const { shopName, logoUrl, stores } = useShopSession();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState("");
  const [mode, setMode] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [rows, setRows] = useState<Vst[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(
    (targetPage = 1) => {
      setLoading(true);
      setError(null);
      api
        .listVst({
          status: status || undefined,
          storeId: storeId || undefined,
          mode: mode || undefined,
          supplierId: supplierId || undefined,
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
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load VSTs"))
        .finally(() => setLoading(false));
    },
    [api, status, storeId, mode, supplierId, search, showDate, from, to]
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(1), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, storeId, mode, supplierId, search, showDate, from, to]);

  const handleClear = () => {
    setStatus("");
    setStoreId("");
    setMode("");
    setSupplierId("");
    setSearch("");
    setShowDate(false);
    setFrom("");
    setTo("");
  };

  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

  // Pulls every row matching the current filters (not just the current
  // page) into a print-friendly document — "Save as PDF" in the browser's
  // print dialog is this app's standard no-library PDF path (see e.g.
  // Purchase Order's report), so this doubles as both "view as PDF" and
  // "download as PDF".
  const handlePdfReport = async () => {
    setExportingPdf(true);
    setError(null);
    try {
      const res = await api.listVst({
        status: status || undefined,
        storeId: storeId || undefined,
        mode: mode || undefined,
        supplierId: supplierId || undefined,
        search: search || undefined,
        from: showDate ? from || undefined : undefined,
        to: showDate ? to || undefined : undefined,
        page: 1,
        pageSize: 5000,
      });
      const allRows = res.rows;
      const totalValue = allRows.reduce((a, r) => a + (r.totalAmount || 0), 0);
      const bodyRows = allRows
        .map(
          (r, idx) => `<tr>
            <td>${idx + 1}</td>
            <td>${r.vstNo}</td>
            <td>${r.store?.name || ""}</td>
            <td>${r.department || ""}</td>
            <td>${r.supplier?.name || ""}</td>
            <td class="right">${r.itemCount ?? 0}</td>
            <td class="right">${fmt(r.totalAmount)}</td>
            <td>${r.createdBy?.name || ""}</td>
            <td>${new Date(r.createdAt).toLocaleDateString()}</td>
            <td>${statusLabel(r.status)}</td>
          </tr>`
        )
        .join("");
      setReportHtml(`
        <html><head><title>VST Report</title>
        <style>
          * { box-sizing: border-box; }
          body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111;font-size:12px}
          .header{display:flex;align-items:center;gap:14px;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:10px}
          .header img{height:52px}
          h1{font-size:16px;margin:0}
          .meta{font-size:11px;color:#444;margin-bottom:14px}
          table{width:100%;border-collapse:collapse}
          th,td{border:1px solid #ccc;padding:5px 6px;font-size:11px;text-align:left}
          th{background:#f1f5f9}
          .right{text-align:right}
          tfoot td{font-weight:bold;background:#f8fafc}
        </style></head>
        <body>
          <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" />` : ""}
            <div><h1>${shopName} — Virtual Stock Transfer Report</h1></div>
          </div>
          <div class="meta">Generated ${new Date().toLocaleString()} — ${allRows.length} record(s)</div>
          <table>
            <thead>
              <tr>
                <th>Sl</th><th>VST No</th><th>VST From</th><th>Department</th><th>Supplier</th>
                <th class="right">SKU</th><th class="right">Value</th><th>By</th><th>Date</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr><td colspan="6">Total</td><td class="right">${fmt(totalValue)}</td><td colspan="3"></td></tr>
            </tfoot>
          </table>
        </body></html>
      `);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate report");
    } finally {
      setExportingPdf(false);
    }
  };

  // Per-row PDF — same item-wise VST report as the Detail screen's own
  // REPORT button, reachable straight from the list without opening Edit.
  const handleRowReport = async (id: number) => {
    setError(null);
    try {
      const vst = await api.getVst(id);
      const itemRows = (vst.items || [])
        .map(
          (it, idx) => `<tr>
            <td>${idx + 1}</td>
            <td>${it.product.externalCode || ""}</td>
            <td>${it.product.name}</td>
            <td>${it.packSize}</td>
            <td class="right">${it.vstQtyPieces}</td>
            <td>${it.batchNo}</td>
            <td>${it.expiryDate.split("T")[0]}</td>
            <td class="right">${fmt(it.ppPerPiece)}</td>
            <td class="right">${fmt(it.totalPpValue)}</td>
            <td class="right">${fmt(it.mrpPerPiece)}</td>
            <td class="right">${fmt(it.mrpPerPiece * it.vstQtyPieces)}</td>
            <td>${it.remarks || ""}</td>
          </tr>`
        )
        .join("");
      setReportHtml(`
        <html><head><title>${vst.vstNo}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;color:#111}
          .header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
          .header img{height:48px}
          h1{font-size:16px;margin:0}
          .meta p{margin:2px 0;font-size:12px}
          table{width:100%;border-collapse:collapse;margin-top:16px}
          th,td{border:1px solid #ccc;padding:5px 7px;font-size:11px;text-align:left}
          th{background:#f1f5f9} .right{text-align:right}
          .words{margin-top:8px;font-size:12px}
          .sign{display:flex;justify-content:space-between;margin-top:60px;font-size:12px}
          .sign div{border-top:1px solid #333;padding-top:4px;width:30%;text-align:center}
        </style></head><body>
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" />` : ""}
          <div>
            <h1>${shopName || ""}</h1>
            <div style="font-size:12px;font-weight:bold">Item-Wise Virtual Stock Transfer (VST) Report</div>
          </div>
        </div>
        <div class="meta">
          <p><b>Store Name:</b> ${vst.store?.name || ""} &nbsp; <b>VST No:</b> ${vst.vstNo} &nbsp; <b>VST Date &amp; Time:</b> ${new Date(vst.createdAt).toLocaleString()}</p>
          <p><b>Supplier Name:</b> ${vst.supplier?.name || ""} &nbsp; <b>Status:</b> ${statusLabel(vst.status)} &nbsp; <b>Approved By:</b> ${vst.approvedBy?.name || "—"}</p>
          ${vst.remarks ? `<p><b>Remarks:</b> ${vst.remarks}</p>` : ""}
        </div>
        <table><thead><tr>
          <th>SL</th><th>Item Code</th><th>Brand Name</th><th>Pack Size</th><th class="right">VST Qty(PCs)</th>
          <th>Batch No</th><th>Exp.Date</th><th class="right">PP/PCs</th><th class="right">Total PP</th>
          <th class="right">MRP/PCs</th><th class="right">Total MRP</th><th>Remarks</th>
        </tr></thead><tbody>${itemRows}</tbody></table>
        <p style="margin-top:10px;text-align:right"><b>Total: ${fmt4(vst.totalAmount)}</b></p>
        <div class="words">In Words: ${amountInWords(vst.totalAmount)}</div>
        <div class="sign">
          <div>VST Done By</div>
          <div>VST Checked By</div>
          <div>VST Approved By</div>
        </div>
        </body></html>
      `);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate report");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-7 gap-2.5 items-end text-xs mb-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Type</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">All</option>
              <option value="APPROVED">Approved</option>
              <option value="UNAPPROVED">Unapproved</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store</label>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">All</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by VST No"
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div className="col-span-2 flex items-end gap-1.5">
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
            <button
              onClick={handlePdfReport}
              disabled={exportingPdf}
              title="View / download VST Report as PDF"
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-1.5 rounded text-xs"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </button>
            <button onClick={handleClear} className="flex-1 bg-[#dc2626] hover:bg-red-700 text-white font-bold py-1.5 rounded text-xs">
              CLEAR
            </button>
            <button onClick={onNew} className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 rounded text-xs">
              NEW
            </button>
          </div>
        </div>
        {showDate && (
          <div className="grid grid-cols-6 gap-2.5 items-end text-xs mb-2.5">
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
        {error && <p className="text-red-600 font-bold text-xs">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">VST From</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Department</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Supplier Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">VST No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">VST Qty (SKU)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">VST Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">VST By</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">VST Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Approved By</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Approve Date</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">VST to RTV(%)</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Remarks</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[7%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.department || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.supplier?.name}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.vstNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.itemCount ?? 0}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.totalAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.createdBy?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-4 px-3 border border-slate-200 truncate">
                  <span className={`px-2 py-0.5 rounded font-bold ${r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.approvedBy?.name || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{(r.vstToRtvPct ?? 0).toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.remarks || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => onEdit(r.id)} className="text-blue-600 hover:text-blue-800 font-bold underline">
                      Edit
                    </button>
                    <button onClick={() => handleRowReport(r.id)} title="View/Download PDF" className="text-red-600 hover:text-red-800">
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : (
                    "No VST records found."
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
