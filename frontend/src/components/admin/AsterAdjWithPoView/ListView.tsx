"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { AdjWithPo, Supplier } from "../../../types";
import { fmt } from "../../../lib/format";
import { PaginationBar } from "../PaginationBar";
import { ComboSelect } from "../ComboSelect";
import { DEBOUNCE_MS, LIST_PAGE_SIZE, statusLabel, VIA_OPTIONS, viaLabel } from "./types";

export const ListView: React.FC<{
  api: ReturnType<typeof shopApi>;
  onNew: () => void;
  onEdit: (id: number) => void;
}> = ({ api, onNew, onEdit }) => {
  const { stores } = useShopSession();
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [rows, setRows] = useState<AdjWithPo[]>([]);
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

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">RTV From</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">RTV VIA</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Department</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Supplier Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">RTV No</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">RTV Date</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">RTV Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">ADJ No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">ADJ Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">ADJ Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">ADJ Store</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">GRN No</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Invoice No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">GRN Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Approve Date</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[6%] truncate"></th>
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
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{rtvFromLabel}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{viaLabel(r.via)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.department || "—"}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.supplier?.name}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{rtvNoLabel}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{rtvDateLabel}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(rtvValueSum)}</td>
                  <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.transactionNo}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(r.rtvAdjustmentValue)}</td>
                  <td className="py-4 px-3 border border-slate-200 truncate">
                    <span className={`px-2 py-0.5 rounded font-bold ${r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.store?.name}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.transactionNo}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.invoiceNo}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.netAmount)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}</td>
                  <td className="py-4 px-3 border border-slate-200 text-center truncate">
                    <button onClick={() => onEdit(r.id)} className="text-blue-600 hover:text-blue-800 font-bold underline">
                      Edit
                    </button>
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
    </div>
  );
};
