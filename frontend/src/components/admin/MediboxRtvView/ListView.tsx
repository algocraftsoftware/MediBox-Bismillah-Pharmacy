"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, FileText } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Rtv } from "../../../types";
import { fmt, fmt4, upper } from "../../../lib/format";
import { amountInWords } from "../../../lib/numberToWords";
import { PaginationBar } from "../PaginationBar";
import { ReportOverlay } from "../ReportOverlay";
import { ComboSelect } from "../ComboSelect";
import { LIST_PAGE_SIZE, statusLabel, viaLabel } from "./types";
import { useSuppliers } from "../../../hooks/useShopLookups";

export const ListView: React.FC<{
  api: ReturnType<typeof shopApi>;
  onNew: () => void;
  onEdit: (id: number) => void;
}> = ({ api, onNew, onEdit }) => {
  const { shopName, logoUrl, stores } = useShopSession();
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [mode, setMode] = useState("");
  const [search, setSearch] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const suppliers = useSuppliers(api);

  const [rows, setRows] = useState<Rtv[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);


  // The screen opens on the last month's returns rather than empty, so the
  // common case — "what have we sent back recently" — needs no search at all.
  // Opening the date filter and choosing dates replaces this window, which is
  // how an older RTV is found.
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const runSearch = useCallback(
    (targetPage = 1) => {
      setLoading(true);
      setError(null);
      setSearched(true);
      api
        .listRtv({
          status: status || undefined,
          storeId: storeId || undefined,
          supplierId: supplierId || undefined,
          mode: mode || undefined,
          search: search || undefined,
          from: showDate ? from || undefined : defaultFrom,
          to: showDate ? to || undefined : undefined,
          page: targetPage,
          pageSize: LIST_PAGE_SIZE,
        })
        .then((res) => {
          setRows(res.rows);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load RTVs"))
        .finally(() => setLoading(false));
    },
    [api, status, storeId, supplierId, mode, search, showDate, from, to, defaultFrom]
  );

  // Bumped by Clear so the list reloads with the reset filters. Re-running
  // through an effect rather than calling runSearch() straight from the handler
  // means it runs after the resets have been applied, against the new values.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // Fired from a timer rather than straight from the effect body: runSearch
    // flips `loading` synchronously, and doing that during an effect cascades
    // an extra render.
    const t = setTimeout(() => runSearch(1), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const handleClear = () => {
    setStatus("");
    setStoreId("");
    setSupplierId("");
    setMode("");
    setSearch("");
    setShowDate(false);
    setFrom("");
    setTo("");
    setPage(1);
    setError(null);
    // Back to the default view — the last month — not a blank screen.
    setReloadToken((n) => n + 1);
  };

  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

  // Per-row PDF — same RTV report as the Detail screen's own REPORT button,
  // reachable straight from the list without opening Edit. Opens as an
  // in-app overlay (ReportOverlay), never a new browser tab.
  const handleRowReport = async (id: number) => {
    setError(null);
    try {
      const rtv = await api.getRtv(id);
      const itemRows = (rtv.items || [])
        .map(
          (it, idx) => `<tr>
            <td>${idx + 1}</td>
            <td>${upper(it.product.externalCode)}</td>
            <td>${upper(it.product.name)}</td>
            <td>${upper(it.batchNo)}</td>
            <td>${it.expiryDate.split("T")[0]}</td>
            <td class="right">${fmt(it.purchasePrice)}</td>
            <td class="right">${it.rtvQtyPieces}</td>
            <td class="right">${fmt(it.rtvValue)}</td>
          </tr>`
        )
        .join("");
      setReportHtml(`
        <html><head><title>${upper(rtv.rtvNo)}</title>
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
            <div style="font-size:12px;font-weight:bold">Return To Vendor (RTV) Report</div>
          </div>
        </div>
        <div class="meta">
          <p><b>From Store:</b> ${rtv.store?.name || ""} &nbsp; <b>RTV VIA:</b> ${viaLabel(rtv.via)} &nbsp; <b>RTV No:</b> ${upper(rtv.rtvNo)} &nbsp; <b>RTV Date:</b> ${new Date(rtv.createdAt).toLocaleString()}</p>
          <p><b>Supplier:</b> ${upper(rtv.supplier?.name)} &nbsp; <b>VST No:</b> ${upper(rtv.vst?.vstNo)} &nbsp; <b>Status:</b> ${statusLabel(rtv.status)}</p>
          <p><b>Receiver:</b> ${rtv.receiverName} &nbsp; <b>Contact No:</b> ${rtv.receiverContact}</p>
          ${rtv.remarks ? `<p><b>Remarks:</b> ${rtv.remarks}</p>` : ""}
        </div>
        <table><thead><tr>
          <th>SL</th><th>Item No</th><th>Item Name</th><th>Batch</th><th>Exp.Date</th>
          <th class="right">Purchase Price</th><th class="right">RTV Qty</th><th class="right">RTV Value</th>
        </tr></thead><tbody>${itemRows}</tbody></table>
        <p style="margin-top:10px;text-align:right"><b>Total: ${fmt4(rtv.totalAmount)}</b></p>
        <div class="words">In Words: ${amountInWords(rtv.totalAmount)}</div>
        <div class="sign">
          <div>Handed Over By</div>
          <div>Received By (${rtv.receiverName})</div>
          <div>RTV Approved By</div>
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
        <div className="grid grid-cols-5 gap-2.5 items-end text-xs mb-2.5">
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
            <label className="font-bold text-slate-700 block mb-1">Supplier</label>
            <ComboSelect
              value={supplierId}
              onChange={setSupplierId}
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="All"
            />
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
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
              placeholder="Search By VST No & RTV No"
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-end gap-1.5">
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
            <button onClick={() => runSearch(1)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded text-xs">
              SEARCH
            </button>
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
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Supplier</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">VST No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">VST Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">RTV No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">RTV Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">RTV Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">RTV By</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Approved By</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] whitespace-nowrap">Approve Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">RTV Receiver</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Contact No</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[5%] whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{viaLabel(r.via)}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.department || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.supplier?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.vst?.vstNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-right whitespace-nowrap">{fmt(r.vst?.totalAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 whitespace-nowrap">{r.rtvNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 whitespace-nowrap">{fmt(r.totalAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded font-bold ${r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.createdBy?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.approvedBy?.name || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.receiverName}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.receiverContact}</td>
                <td className="py-4 px-3 border border-slate-200 text-center whitespace-nowrap">
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
                <td colSpan={15} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : searched ? (
                    "No RTV records found."
                  ) : (
                    "Fill in the filters above and click SEARCH."
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
