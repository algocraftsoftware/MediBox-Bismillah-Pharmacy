"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { ExpireProductsType, ExpireProductRow, Supplier } from "../../types";
import { SearchableSelect } from "./SearchableSelect";
import { PaginationBar } from "./PaginationBar";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

export const AsterExpireProductsView: React.FC = () => {
  const { shopSlug, token, stores, selectedStoreId } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [warehouseId, setWarehouseId] = useState<string>(selectedStoreId ? String(selectedStoreId) : "");
  const [type, setType] = useState<ExpireProductsType | "">("");
  const [supplierId, setSupplierId] = useState("");
  const [group, setGroup] = useState("");
  const [generic, setGeneric] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [generics, setGenerics] = useState<string[]>([]);

  const [rows, setRows] = useState<ExpireProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    api.getDosageForms().then(setGroups).catch(() => {});
    api.getGenerics().then(setGenerics).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSearch = Boolean(warehouseId && type && (type === "EXPIRED" || (from && to)));

  const filters = {
    storeId: warehouseId || undefined,
    type: type || undefined,
    from: type === "EXPIRABLE" ? from || undefined : undefined,
    to: type === "EXPIRABLE" ? to || undefined : undefined,
    supplierId: supplierId || undefined,
    group: group || undefined,
    generic: generic || undefined,
    search: search || undefined,
  };

  const runSearch = (targetPage = 1) => {
    if (!canSearch) return;
    setError(null);
    setLoading(true);
    api
      .getExpireProducts({ ...filters, page: targetPage, pageSize: PAGE_SIZE })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Search failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!canSearch) {
      setRows([]);
      setTotal(0);
      setPage(1);
      return;
    }
    const t = setTimeout(() => runSearch(1), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, type, from, to, supplierId, group, generic, search]);

  const handleClear = () => {
    setWarehouseId("");
    setType("");
    setSupplierId("");
    setGroup("");
    setGeneric("");
    setFrom("");
    setTo("");
    setSearch("");
    setRows([]);
    setTotal(0);
    setPage(1);
    setError(null);
  };

  const handleExport = async () => {
    if (!canSearch) {
      setError("Select a Warehouse and Type first");
      return;
    }
    setExporting(true);
    try {
      await api.exportExpireProducts(filters);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-5 gap-2.5 items-end text-xs mb-2.5">
          <SearchableSelect
            label="Warehouse*"
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder="Select..."
            options={stores.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <SearchableSelect
            label="Type"
            value={type}
            onChange={(v) => setType(v as ExpireProductsType)}
            placeholder="Select..."
            options={[
              { value: "EXPIRED", label: "Expired" },
              { value: "EXPIRABLE", label: "Expirable" },
            ]}
          />
          <SearchableSelect
            label="Supplier"
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Select..."
            options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <SearchableSelect
            label="Group"
            value={group}
            onChange={setGroup}
            placeholder="Select..."
            options={groups.map((g) => ({ value: g, label: g }))}
          />
          <SearchableSelect
            label="Generic"
            value={generic}
            onChange={setGeneric}
            placeholder="Search ingredient..."
            allowFreeText
            options={generics.map((g) => ({ value: g, label: g }))}
          />
        </div>

        <div className={`grid gap-2.5 items-end text-xs ${type === "EXPIRABLE" ? "grid-cols-5" : "grid-cols-3"}`}>
          {type === "EXPIRABLE" && (
            <>
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
            </>
          )}
          <div className="col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Item No, Name & Group..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Download as Excel"
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-1.5 rounded flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={handleClear}
            className="bg-[#dc2626] hover:bg-red-700 text-white font-bold py-1.5 rounded"
          >
            CLEAR
          </button>
        </div>

        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">SL</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">Item No</th>
              <th className="py-4 px-3 border border-slate-300 w-[20%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Group</th>
              <th className="py-4 px-3 border border-slate-300 w-[17%] truncate">Supplier</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">MRP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">PP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Stock Qty</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">Batch</th>
              <th className="py-4 px-3 border border-slate-300 w-[10%] truncate">Exp.Date</th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r, i) => (
              <tr key={`${r.itemNo}-${r.batch}-${i}`} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 text-slate-500 truncate">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-800 truncate">{r.itemNo}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.itemName}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.group || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.supplier || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.mrp.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.pp.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{r.stockQty}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.batch}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.expDate.split("T")[0]}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : !canSearch ? (
                    "Select a Warehouse and Type to view expiring products."
                  ) : (
                    "No products found for the selected filters."
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
