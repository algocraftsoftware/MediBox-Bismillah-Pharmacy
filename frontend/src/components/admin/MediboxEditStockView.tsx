"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw, Save, Search } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { EditStockRow, EditStockUpdate, StockDataType } from "../../types";
import { SearchableSelect } from "./SearchableSelect";
import { PaginationBar } from "./PaginationBar";
import { useDepartments, useSuppliers } from "../../hooks/useShopLookups";

const SEARCH_DEBOUNCE_MS = 250;

const PAGE_SIZE = 10;

type EditableField = "itemName" | "displayCategory" | "purchasePrice" | "salesPrice" | "boxQty";

// Raw input text per edited cell — kept as typed rather than parsed on every
// keystroke, so a half-written "12." doesn't get normalized out from under the
// cursor. Only fields the user actually touched are present.
type RowEdit = Partial<Record<EditableField, string>>;

type ParsedRow = {
  key: string;
  row: EditStockRow;
  // The payload for this row, set only when an edited cell holds a valid value
  // that genuinely differs from what's stored.
  update: EditStockUpdate | null;
  // Which cells differ from stored (for highlighting) and which are invalid.
  changedFields: Set<EditableField>;
  invalidFields: Set<EditableField>;
  error: string | null;
};

// One row per product — whatever batches stand behind it in the warehouse are
// aggregated into that single row, so an item is edited in one place and the
// change carries to the whole product and all of its batches at once.
const rowKeyOf = (r: EditStockRow) => String(r.productId);

// Prices are stored as floats and shown to 2dp; compare at that same precision
// so re-typing "12.50" over 12.5 isn't treated as a change.
const round2 = (n: number) => Math.round(n * 100) / 100;

const moneyInputValue = (n: number | null) => (n === null ? "" : n.toFixed(2));

function parseRow(row: EditStockRow, edit: RowEdit | undefined): ParsedRow {
  const key = rowKeyOf(row);
  const changedFields = new Set<EditableField>();
  const invalidFields = new Set<EditableField>();
  let error: string | null = null;
  const update: EditStockUpdate = { productId: row.productId };

  const fail = (field: EditableField, message: string) => {
    invalidFields.add(field);
    if (!error) error = `${row.itemName}: ${message}`;
  };

  // Item Name may be corrected, but not emptied — it is how the product is
  // identified on every other screen, receipt and report.
  if (edit?.itemName !== undefined) {
    const next = edit.itemName.trim();
    if (next === "") {
      fail("itemName", "Item Name cannot be empty");
    } else if (next.length > 191) {
      fail("itemName", "Item Name is too long (max 191 characters)");
    } else if (next !== row.itemName.trim()) {
      update.itemName = next;
      changedFields.add("itemName");
    }
  }

  if (edit?.displayCategory !== undefined) {
    const next = edit.displayCategory.trim();
    if (next.length > 191) {
      fail("displayCategory", "Display Category is too long (max 191 characters)");
    } else if (next !== (row.displayCategory ?? "").trim()) {
      update.displayCategory = next === "" ? null : next;
      changedFields.add("displayCategory");
    }
  }

  if (edit?.boxQty !== undefined) {
    const raw = edit.boxQty.trim();
    const qty = Number(raw);
    if (raw === "" || !Number.isInteger(qty) || qty < 1) {
      fail("boxQty", "Box Qty must be a whole number of 1 or more");
    } else if (qty !== row.boxQty) {
      update.boxQty = qty;
      changedFields.add("boxQty");
    }
  }

  const parsePrice = (field: "purchasePrice" | "salesPrice", label: string, stored: number | null) => {
    const raw = edit?.[field];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const price = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(price) || price < 0) {
      fail(field, `${label} must be a number of 0 or more`);
      return;
    }
    if (stored === null || round2(price) !== round2(stored)) {
      update[field] = round2(price);
      changedFields.add(field);
    }
  };
  parsePrice("purchasePrice", "Purchase Price", row.purchasePrice);
  parsePrice("salesPrice", "Sales Price", row.salesPrice);

  return {
    key,
    row,
    update: !error && changedFields.size > 0 ? update : null,
    changedFields,
    invalidFields,
    error,
  };
}

export const MediboxEditStockView: React.FC = () => {
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
  const departments = useDepartments(api);
  const suppliers = useSuppliers(api);

  const [rows, setRows] = useState<EditStockRow[]>([]);
  // The Display Category options offered in the grid: the categories this
  // pharmacy already uses, so a value can be picked instead of retyped.
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);

  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      api.getDisplayCategories().then(setCategories).catch(() => setCategories([]));
    }, 0);
    return () => clearTimeout(t);
  }, [api]);
  const [saving, setSaving] = useState(false);

  const [suggestions, setSuggestions] = useState<
    { id: number; name: string; externalCode: string | null; genericName: string }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getDosageForms().then(setDosageForms).catch(() => {});
    api.getGenerics().then(setGenerics).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live suggestions as you type — matches the same Item No/Name/Generic
  // breadth the actual search runs, so the dropdown offers exactly what
  // clicking SEARCH would find, same "dropdown for every filter" affordance
  // the other filter fields already have.
  useEffect(() => {
    const q = search.trim();
    const t = setTimeout(() => {
      if (q.length < 2) {
        setSuggestions([]);
        return;
      }
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

  const parsedRows = useMemo(() => rows.map((r) => parseRow(r, edits[rowKeyOf(r)])), [rows, edits]);
  const parsedByKey = useMemo(() => new Map(parsedRows.map((p) => [p.key, p])), [parsedRows]);
  const pendingUpdates = useMemo(
    () => parsedRows.map((p) => p.update).filter((u): u is EditStockUpdate => u !== null),
    [parsedRows]
  );
  const firstInvalid = parsedRows.find((p) => p.error)?.error ?? null;
  // A cell that was typed into but matches the stored value again still counts
  // as an open edit for the discard prompt, so nothing silently disappears.
  const touchedRowCount = parsedRows.filter((p) => p.changedFields.size > 0 || p.error).length;

  const fetchPage = (targetPage: number) => {
    if (!warehouseId) {
      setError("Select a Warehouse first");
      return;
    }
    setError(null);
    setLoading(true);
    setSearched(true);
    api
      .getEditStock({ ...filters, page: targetPage, pageSize: PAGE_SIZE })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Search failed"))
      .finally(() => setLoading(false));
  };

  // Loading a different set of rows throws away whatever is typed into the
  // current ones, so it needs the user's say-so first.
  const confirmDiscard = () =>
    touchedRowCount === 0 ||
    window.confirm(
      `${touchedRowCount} row${touchedRowCount === 1 ? "" : "s"} ${
        touchedRowCount === 1 ? "has" : "have"
      } unsaved changes. Discard them?`
    );

  const runSearch = (targetPage = 1) => {
    if (!confirmDiscard()) return;
    setEdits({});
    setNotice(null);
    fetchPage(targetPage);
  };

  const handleClear = () => {
    if (!confirmDiscard()) return;
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
    setNotice(null);
    setEdits({});
  };

  const handleExport = async () => {
    if (!warehouseId) {
      setError("Select a Warehouse first");
      return;
    }
    setExporting(true);
    try {
      await api.exportEditStock(filters);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const setCell = (row: EditStockRow, field: EditableField, value: string) => {
    const key = rowKeyOf(row);
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    setNotice(null);
  };

  // Prices are stored to paisa, so a typed "12.499" settles to "12.50" the
  // moment the cell loses focus. Without this the grid could sit showing a
  // sub-paisa value that rounds to what's already stored — nothing to save, but
  // the cell wouldn't look like it.
  const normalizePriceCell = (row: EditStockRow, field: "purchasePrice" | "salesPrice") => {
    const key = rowKeyOf(row);
    const raw = edits[key]?.[field];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const value = Number(trimmed);
    // Leave an invalid entry exactly as typed so its error stays visible.
    if (trimmed === "" || !Number.isFinite(value) || value < 0) return;
    const formatted = round2(value).toFixed(2);
    if (formatted === raw) return;
    setEdits((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], [field]: formatted } } : prev));
  };

  const revertCell = (row: EditStockRow, field: EditableField) => {
    const key = rowKeyOf(row);
    setEdits((prev) => {
      const rowEdit = prev[key];
      if (!rowEdit || rowEdit[field] === undefined) return prev;
      const rest: RowEdit = { ...rowEdit };
      delete rest[field];
      const next = { ...prev };
      if (Object.keys(rest).length === 0) delete next[key];
      else next[key] = rest;
      return next;
    });
  };

  const handleDiscardAll = () => {
    if (!confirmDiscard()) return;
    setEdits({});
    setError(null);
    setNotice(null);
  };

  const handleSave = async () => {
    if (firstInvalid) {
      setError(firstInvalid);
      return;
    }
    if (pendingUpdates.length === 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.saveEditStock(Number(warehouseId), pendingUpdates);
      setEdits({});
      setNotice(
        `Saved ${res.rowsUpdated} row${res.rowsUpdated === 1 ? "" : "s"} — ${res.productsUpdated} item record${
          res.productsUpdated === 1 ? "" : "s"
        } and ${res.batchesUpdated} batch${res.batchesUpdated === 1 ? "" : "es"} updated.`
      );
      // Re-read the page so every cell shows what the database now holds.
      fetchPage(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cellInputClass = (parsed: ParsedRow | undefined, field: EditableField, extra = "") => {
    const invalid = parsed?.invalidFields.has(field);
    const changed = parsed?.changedFields.has(field);
    return `w-full rounded px-2 py-1 text-sm font-semibold border outline-none ${
      invalid
        ? "border-red-500 bg-red-50 text-red-700"
        : changed
          ? "border-amber-500 bg-amber-50 text-slate-900"
          : "border-slate-300 bg-white text-slate-900 focus:border-emerald-500"
    } ${extra}`;
  };

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

        <p className="text-[11px] font-semibold text-slate-500 mt-2">
          Editable columns: <span className="text-slate-700">Display Category</span>,{" "}
          <span className="text-slate-700">Purchase Price</span>, <span className="text-slate-700">Sales Price</span>,{" "}
          <span className="text-slate-700">Box Qty</span>. Every item appears once: Item Name, Display Category and Box
          Qty belong to the item itself (all warehouses), and a Purchase Price or Sales Price change is applied to every
          batch of that item in the selected warehouse.
        </p>

        {(pendingUpdates.length > 0 || firstInvalid) && (
          <div className="mt-2 flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 rounded px-3 py-2">
            <span className="text-xs font-bold text-amber-800">
              {pendingUpdates.length} row{pendingUpdates.length === 1 ? "" : "s"} changed and not saved yet
              {firstInvalid ? " — fix the highlighted cell first" : ""}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSave}
                disabled={saving || pendingUpdates.length === 0 || Boolean(firstInvalid)}
                className="bg-[#047857] hover:bg-[#065f46] disabled:opacity-50 text-white font-bold text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <Spinner size="xs" variant="white" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    SAVE CHANGES
                  </>
                )}
              </button>
              <button
                onClick={handleDiscardAll}
                disabled={saving}
                className="bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 text-slate-700 font-bold text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                DISCARD
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
        {notice && <p className="text-emerald-700 font-bold text-xs mt-2">{notice}</p>}
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-3.5 px-3 border border-slate-300 w-[8%] whitespace-nowrap">Item No</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[11%] whitespace-nowrap">Item Name</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[10%] whitespace-nowrap">Generic</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[10%] whitespace-nowrap">Display Category</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[7%] whitespace-nowrap">Department</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Manufacturer</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Last Req. Date</th>
              <th className="py-3.5 px-3 border border-slate-300 w-[9%] whitespace-nowrap">Last Sold Date</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[8%] whitespace-nowrap">Purchase Price</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[7%] whitespace-nowrap">Sales Price</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">Box Qty</th>
              <th className="py-3.5 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">Stock Qty</th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r) => {
              const key = rowKeyOf(r);
              const parsed = parsedByKey.get(key);
              const noBatch = r.batchCount === 0;
              const purchaseValue = edits[key]?.purchasePrice ?? moneyInputValue(r.purchasePrice);
              const salesValue = edits[key]?.salesPrice ?? moneyInputValue(r.salesPrice);
              // Billing refuses to sell a batch below its purchase price, so
              // flag that combination here instead of letting it surface later
              // at the counter.
              const belowCost =
                purchaseValue.trim() !== "" &&
                salesValue.trim() !== "" &&
                Number.isFinite(Number(purchaseValue)) &&
                Number.isFinite(Number(salesValue)) &&
                round2(Number(salesValue)) < round2(Number(purchaseValue));
              return (
                <tr key={key} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                  <td className="py-3.5 px-3 border border-slate-200 font-bold text-slate-800 whitespace-nowrap">{r.itemNo}</td>
                  <td className="py-2 px-2 border border-slate-200">
                    <input
                      value={edits[key]?.itemName ?? r.itemName}
                      onChange={(e) => setCell(r, "itemName", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") revertCell(r, "itemName");
                      }}
                      title="Item Name — correcting this renames the item everywhere it appears"
                      className={`${cellInputClass(parsed, "itemName")} min-w-56 font-bold`}
                    />
                  </td>
                  <td className="py-3.5 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.genericName}</td>
                  <td className="py-2 px-2 border border-slate-200">
                    {/* A datalist rather than a select: clicking shows the
                        categories this pharmacy actually uses, typing filters
                        them, and a genuinely new one can still be typed. The
                        list itself is declared once below the table, so a
                        200-row page does not build 200 dropdowns. */}
                    <input
                      value={edits[key]?.displayCategory ?? r.displayCategory ?? ""}
                      onChange={(e) => setCell(r, "displayCategory", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") revertCell(r, "displayCategory");
                      }}
                      placeholder="—"
                      list="edit-stock-display-categories"
                      title="Display Category — pick one already in use, or type a new one"
                      className={cellInputClass(parsed, "displayCategory")}
                    />
                  </td>
                  <td className="py-3.5 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.department}</td>
                  <td className="py-3.5 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{r.manufacturer || "—"}</td>
                  <td className="py-3.5 px-3 border border-slate-200 text-slate-500 whitespace-nowrap">
                    {r.lastPurchaseReqDate ? r.lastPurchaseReqDate.split("T")[0] : "—"}
                  </td>
                  <td className="py-3.5 px-3 border border-slate-200 text-slate-500 whitespace-nowrap">
                    {r.lastSoldDate ? r.lastSoldDate.split("T")[0] : "—"}
                  </td>
                  <td className="py-2 px-2 border border-slate-200">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      disabled={noBatch}
                      value={purchaseValue}
                      onChange={(e) => setCell(r, "purchasePrice", e.target.value)}
                      onBlur={() => normalizePriceCell(r, "purchasePrice")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") revertCell(r, "purchasePrice");
                      }}
                      placeholder={noBatch ? "—" : "0.00"}
                      title={
                        noBatch
                          ? "No batch in this warehouse yet — receive the item through a GRN before setting a price"
                          : "Purchase Price — applies to this item and every batch of it in the selected warehouse"
                      }
                      className={cellInputClass(
                        parsed,
                        "purchasePrice",
                        `text-right ${noBatch ? "disabled:bg-slate-100 disabled:text-slate-400" : ""}`
                      )}
                    />
                  </td>
                  <td className="py-2 px-2 border border-slate-200">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      disabled={noBatch}
                      value={salesValue}
                      onChange={(e) => setCell(r, "salesPrice", e.target.value)}
                      onBlur={() => normalizePriceCell(r, "salesPrice")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") revertCell(r, "salesPrice");
                      }}
                      placeholder={noBatch ? "—" : "0.00"}
                      title={
                        noBatch
                          ? "No batch in this warehouse yet — receive the item through a GRN before setting a price"
                          : belowCost
                            ? "Sales Price is below Purchase Price — Billing will refuse to sell this item"
                            : "Sales Price — applies to this item and every batch of it in the selected warehouse"
                      }
                      className={`${cellInputClass(
                        parsed,
                        "salesPrice",
                        `text-right ${noBatch ? "disabled:bg-slate-100 disabled:text-slate-400" : ""}`
                      )} ${belowCost && !parsed?.invalidFields.has("salesPrice") ? "ring-1 ring-orange-400" : ""}`}
                    />
                  </td>
                  <td className="py-2 px-2 border border-slate-200">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={edits[key]?.boxQty ?? String(r.boxQty)}
                      onChange={(e) => setCell(r, "boxQty", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") revertCell(r, "boxQty");
                      }}
                      title="Box Qty — applies to this item in every warehouse"
                      className={cellInputClass(parsed, "boxQty", "text-right")}
                    />
                  </td>
                  <td
                    className={`py-3.5 px-3 border border-slate-200 text-right font-bold whitespace-nowrap ${r.stockQty === 0 ? "text-red-600" : "text-slate-900"}`}
                  >
                    {r.stockQty}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : !searched ? (
                    "Select a Warehouse and click SEARCH to edit stock data."
                  ) : (
                    "No products found for the selected filters."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {/* Shared by every Display Category cell above. */}
        <datalist id="edit-stock-display-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
