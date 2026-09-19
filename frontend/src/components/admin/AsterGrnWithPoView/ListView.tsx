"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Grn, Supplier } from "../../../types";
import { fmt } from "../../../lib/format";
import { PaginationBar } from "../PaginationBar";
import { ComboSelect } from "../ComboSelect";
import { LIST_PAGE_SIZE, statusLabel } from "./types";

export const ListView: React.FC<{
  api: ReturnType<typeof shopApi>;
  onNew: () => void;
  onEdit: (id: number) => void;
}> = ({ api, onNew, onEdit }) => {
  const { stores } = useShopSession();
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [rows, setRows] = useState<Grn[]>([]);
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
        .listGrns({
          status: status || undefined,
          storeId: storeId || undefined,
          supplierId: supplierId || undefined,
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
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load GRNs"))
        .finally(() => setLoading(false));
    },
    [api, status, storeId, supplierId, search, from, to]
  );

  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = () => {
    setStatus("");
    setStoreId("");
    setSupplierId("");
    setSearch("");
    setFrom("");
    setTo("");
    setTimeout(() => runSearch(1), 0);
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
              <option value="UNAPPROVED">Unapproved</option>
              <option value="APPROVED">Approved</option>
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
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
              placeholder="Trans. No or Req. No..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
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
        </div>
        <div className="flex justify-between items-center">
          {error && <p className="text-red-600 font-bold text-xs">{error}</p>}
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={() => runSearch(1)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded flex items-center gap-1.5 text-xs"
            >
              <Search className="w-3.5 h-3.5" />
              SEARCH
            </button>
            <button
              onClick={handleClear}
              className="bg-[#dc2626] hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded text-xs"
            >
              CLEAR
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

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Trans. No.</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">GRN Date &amp; Time</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Store Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">Supplier Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Invoice No.</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Approved By</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Approved Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">User</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Trans. Ref No.</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Exp. Adj. Amt</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Avg.GP(%)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Net Amount</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[5%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.transactionNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.supplier?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.invoiceNo}</td>
                <td className="py-4 px-3 border border-slate-200 truncate">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.approvedBy?.name || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.createdBy?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.transactionRefNo || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(r.expiryAdjustmentAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.avgGpPct.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(r.netAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  <button onClick={() => onEdit(r.id)} className="text-blue-600 hover:text-blue-800 font-bold underline">
                    Edit
                  </button>
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
    </div>
  );
};
