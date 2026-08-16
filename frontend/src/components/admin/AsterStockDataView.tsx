"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { Department, StockDataRow, StockDataType, Supplier } from "../../types";
import { SearchableSelect } from "./SearchableSelect";
import { PaginationBar } from "./PaginationBar";

const SEARCH_DEBOUNCE_MS = 250;

const PAGE_SIZE = 10;

export const AsterStockDataView: React.FC = () => {
  const { shopSlug, token, stores, selectedStoreId } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [warehouseId, setWarehouseId] = useState<string>(selectedStoreId ? String(selectedStoreId) : "");
  const [type, setType] = useState<StockDataType>("ALL");
  const [dosageForm, setDosageForm] = useState("");
  const [generic, setGeneric] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");

  const [dosageForms, setDosageForms] = useState<string[]>([]);
  const [generics, setGenerics] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [rows, setRows] = useState<StockDataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);

  const [suggestions, setSuggestions] = useState<
    { id: number; name: string; externalCode: string | null; genericName: string }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getDosageForms().then(setDosageForms).catch(() => {});
    api.getGenerics().then(setGenerics).catch(() => {});
    api.getDepartments().then(setDepartments).catch(() => {});
    api.getSuppliers().then(setSuppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live suggestions as you type — matches the same Item No/Name/Generic
  // breadth the actual search runs, so the dropdown offers exactly what
  // clicking SEARCH would find, same "dropdown for every filter" affordance
  // the other Stock Data fields already have.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .getStockSearchSuggestions(q)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [api, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filters = {
    storeId: warehouseId || undefined,
    type: type !== "ALL" ? type : undefined,
    dosageForm: dosageForm || undefined,
    generic: generic || undefined,
    departmentId: departmentId || undefined,
    supplierId: supplierId || undefined,
    search: search || undefined,
  };

  const runSearch = (targetPage = 1) => {
    if (!warehouseId) {
      setError("Select a Warehouse first");
      return;
    }
    setError(null);
    setLoading(true);
    setSearched(true);
    api
      .getStockData({ ...filters, page: targetPage, pageSize: PAGE_SIZE })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Search failed"))
      .finally(() => setLoading(false));
  };

  const handleClear = () => {
    setWarehouseId("");
    setType("ALL");
    setDosageForm("");
    setGeneric("");
    setDepartmentId("");
    setSupplierId("");
    setSearch("");
    setRows([]);
    setTotal(0);
    setPage(1);
    setSearched(false);
    setError(null);
  };

  const handleExport = async () => {
    if (!warehouseId) {
      setError("Select a Warehouse first");
      return;
    }
    setExporting(true);
    try {
      await api.exportStockData(filters);
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
        <div className="grid grid-cols-4 gap-2.5 items-end text-xs mb-2.5">
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
            onChange={(v) => setType(v as StockDataType)}
            placeholder="All"
            options={[
              { value: "ALL", label: "All" },
              { value: "AVAILABLE", label: "Available Stock" },
              { value: "ZERO", label: "Zero Stock" },
            ]}
          />
          <SearchableSelect
            label="Dosage"
            value={dosageForm}
            onChange={setDosageForm}
            placeholder="Select..."
            options={dosageForms.map((d) => ({ value: d, label: d }))}
          />
          <SearchableSelect
            label="Generic (Ingredient)"
            value={generic}
            onChange={setGeneric}
            placeholder="Search ingredient..."
            allowFreeText
            options={generics.map((g) => ({ value: g, label: g }))}
          />
        </div>

        <div className="grid grid-cols-6 gap-2.5 items-end text-xs">
          <SearchableSelect
            label="Department"
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="All"
            options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          />
          <SearchableSelect
            label="Manufacturer"
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Select..."
            options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <div className="col-span-2 relative" ref={searchBoxRef}>
            <label className="font-bold text-slate-700 block mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowSuggestions(false);
                  runSearch(1);
                }
                if (e.key === "Escape") setShowSuggestions(false);
              }}
              placeholder="Search by Item No, Name & Ingredient..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-300 rounded shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch(s.name);
                        setShowSuggestions(false);
                        runSearch(1);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50"
                    >
                      <span className="font-bold text-slate-900">{s.name}</span>
                      {s.externalCode ? <span className="text-slate-500"> — {s.externalCode}</span> : null}
                      {s.genericName ? <span className="text-slate-400"> ({s.genericName})</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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

        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-3.5 px-3 border border-slate-300 w-[8%] truncate">Item No</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[11%] truncate">Item Name</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[10%] truncate">Generic</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[10%] truncate">Display Category</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[7%] truncate">Department</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[9%] truncate">Manufacturer</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[9%] truncate">Last Req. Date</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[9%] truncate">Last Sold Date</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[8%] truncate">Purchase Price</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[7%] truncate">Sales Price</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[6%] truncate">Box Qty</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[6%] truncate">Stock Qty</th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r, i) => (
              <tr key={`${r.itemNo}-${i}`} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-3.5 px-3 border border-slate-200 font-bold text-slate-800 truncate">{r.itemNo}</td>
                <td className="py-3.5 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.itemName}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-slate-600 truncate">{r.genericName}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-slate-600 truncate">{r.displayCategory}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-slate-600 truncate">{r.department}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-slate-600 truncate">{r.manufacturer || "—"}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-slate-500 truncate">
                  {r.lastPurchaseReqDate ? r.lastPurchaseReqDate.split("T")[0] : "—"}
                </td>
                <td className="py-3.5 px-3 border border-slate-200 text-slate-500 truncate">{r.lastSoldDate ? r.lastSoldDate.split("T")[0] : "—"}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-right truncate">{r.purchasePrice?.toFixed(2) ?? "—"}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-right truncate">{r.salesPrice?.toFixed(2) ?? "—"}</td>
                <td className="py-3.5 px-3 border border-slate-200 text-right truncate">{r.boxQty}</td>
                <td
                  className={`py-3.5 px-3 border border-slate-200 text-right font-bold truncate ${r.stockQty === 0 ? "text-red-600" : "text-slate-900"}`}
                >
                  {r.stockQty}
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : !searched ? (
                    "Select a Warehouse and click SEARCH to view stock data."
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
