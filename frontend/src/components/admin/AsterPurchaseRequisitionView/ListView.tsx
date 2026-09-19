"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { PurchaseRequisition, Supplier } from "../../../types";
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
  const [type, setType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [mode, setMode] = useState<string>("");
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [rows, setRows] = useState<PurchaseRequisition[]>([]);
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
        .listRequisitions({
          type: type || undefined,
          status: status || undefined,
          storeId: storeId || undefined,
          supplierId: supplierId || undefined,
          mode: mode || undefined,
          search: search || undefined,
          page: targetPage,
          pageSize: LIST_PAGE_SIZE,
        })
        .then((res) => {
          setRows(res.rows);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load requisitions"))
        .finally(() => setLoading(false));
    },
    [api, type, status, storeId, supplierId, mode, search]
  );

  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = () => {
    setType("");
    setStatus("");
    setStoreId("");
    setSupplierId("");
    setMode("");
    setSearch("");
    setTimeout(() => runSearch(1), 0);
  };

  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-7 gap-2.5 items-end text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Type</label>
            <ComboSelect
              value={type}
              onChange={setType}
              options={[
                { value: "REGULAR", label: "Regular" },
                { value: "URGENT", label: "Urgent" },
              ]}
              placeholder="All"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Status</label>
            <ComboSelect
              value={status}
              onChange={setStatus}
              options={[
                { value: "UNAPPROVED", label: "Unapproved" },
                { value: "APPROVED", label: "Approved" },
                { value: "FINAL_APPROVED", label: "Final Approved" },
              ]}
              placeholder="All"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store</label>
            <ComboSelect
              value={storeId}
              onChange={setStoreId}
              options={stores.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="All"
            />
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
            <label className="font-bold text-slate-700 block mb-1">Requisition Mode</label>
            <ComboSelect
              value={mode}
              onChange={setMode}
              options={[
                { value: "PHARMA", label: "Pharma" },
                { value: "NON_PHARMA", label: "Non-Pharma" },
              ]}
              placeholder="All"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
              placeholder="Requisition No..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
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
          </div>
        </div>
        <div className="flex justify-between items-center mt-2.5">
          {error && <p className="text-red-600 font-bold text-xs">{error}</p>}
          <div className="flex-1" />
          <button
            onClick={onNew}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-1.5 px-4 rounded flex items-center gap-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            NEW
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[15%] truncate">Requisition No.</th>
              <th className="py-4 px-3 border border-slate-300 w-[11%] truncate">Date &amp; Time</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Store</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Supplier</th>
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Mode</th>
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Type</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Status</th>
              <th className="py-4 px-3 border border-slate-300 w-[11%] truncate">Approved By</th>
              <th className="py-4 px-3 border border-slate-300 w-[12%] truncate">Approved Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">User</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">GP%</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[12%] truncate">Total Amount</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[4%] truncate">Edit</th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.requisitionNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">
                  {new Date(r.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })}
                  <div className="text-[10px] text-slate-400">
                    {new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.supplier?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.mode === "PHARMA" ? "Pharma" : "Non-Pharma"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.type}</td>
                <td className="py-4 px-3 border border-slate-200 truncate">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      r.status === "FINAL_APPROVED"
                        ? "bg-teal-100 text-teal-700"
                        : r.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.approvedBy?.name || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">
                  {r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}
                </td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.createdBy?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.avgGpPct.toFixed(2)}%</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(r.totalPPAmount)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  <button
                    onClick={() => onEdit(r.id)}
                    className="text-blue-600 hover:text-blue-800 font-bold underline"
                  >
                    Edit
                  </button>
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
                    "No purchase requisitions found."
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
