"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PackagePlus, Plus } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { CreatedStockRow, Department, Supplier } from "../../types";
import { SearchableSelect } from "./SearchableSelect";

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  children,
  className = "",
}) => (
  <div className={className}>
    <label className="font-bold text-slate-700 block mb-1">
      {label}
      {hint && <span className="font-semibold text-slate-400 normal-case"> — {hint}</span>}
    </label>
    {children}
  </div>
);

const inputClass = "w-full border border-slate-300 rounded px-2 py-1.5 font-semibold outline-none focus:border-emerald-500";

export const AsterCreateStockView: React.FC = () => {
  const { shopSlug, token, stores, selectedStoreId } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [warehouseId, setWarehouseId] = useState<string>(selectedStoreId ? String(selectedStoreId) : "");
  const [itemName, setItemName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [displayCategory, setDisplayCategory] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [subDepartmentId, setSubDepartmentId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [itemType, setItemType] = useState("");
  const [unit, setUnit] = useState("Pcs");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [boxQty, setBoxQty] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salesPrice, setSalesPrice] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [itemTypes, setItemTypes] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [generics, setGenerics] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [nextItemNo, setNextItemNo] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedStockRow[]>([]);

  useEffect(() => {
    api.getDepartments().then(setDepartments).catch(() => {});
    api.getSuppliers().then(setSuppliers).catch(() => {});
    api.getDosageForms().then(setItemTypes).catch(() => {});
    api.getGenerics().then(setGenerics).catch(() => {});
    api.getDisplayCategories().then(setCategories).catch(() => {});
    api.getUnits().then(setUnits).catch(() => {});
    api
      .getNextItemNo()
      .then((r) => setNextItemNo(r.itemNo))
      .catch(() => setNextItemNo(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sub-departments belong to a department, so the list follows whichever one
  // is selected and a stale pick is dropped when the department changes.
  const subDepartments = departments.find((d) => String(d.id) === departmentId)?.subDepartments ?? [];

  const handleDepartmentChange = (value: string) => {
    setDepartmentId(value);
    setSubDepartmentId("");
  };

  const resetEntryFields = () => {
    // Warehouse, Department and Manufacturer stay put — entering a run of items
    // from one supplier shouldn't mean re-picking them every time.
    setItemName("");
    setGenericName("");
    setDisplayCategory("");
    setSubDepartmentId("");
    setItemType("");
    setUnit("Pcs");
    setReorderLevel("0");
    setBoxQty("1");
    setPurchasePrice("");
    setSalesPrice("");
  };

  const handleClear = () => {
    resetEntryFields();
    setWarehouseId(selectedStoreId ? String(selectedStoreId) : "");
    setDepartmentId("");
    setSupplierId("");
    setError(null);
  };

  const handlePublish = async () => {
    if (!warehouseId) {
      setError("Select a Warehouse first");
      return;
    }
    if (!itemName.trim()) {
      setError("Item Name is required");
      return;
    }
    if (!departmentId) {
      setError("Select a Department");
      return;
    }
    const box = Number(boxQty);
    if (!Number.isInteger(box) || box < 1) {
      setError("Box Qty must be a whole number of 1 or more");
      return;
    }
    const rol = Number(reorderLevel || 0);
    if (!Number.isInteger(rol) || rol < 0) {
      setError("Re-order Level must be a whole number of 0 or more");
      return;
    }
    const pp = Number(purchasePrice || 0);
    const sp = Number(salesPrice || 0);
    if (!Number.isFinite(pp) || pp < 0 || !Number.isFinite(sp) || sp < 0) {
      setError("Purchase Price and Sales Price must be numbers of 0 or more");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const row = await api.createStock({
        storeId: Number(warehouseId),
        name: itemName.trim(),
        genericName: genericName.trim() || undefined,
        displayCategory: displayCategory.trim() || undefined,
        departmentId: Number(departmentId),
        subDepartmentId: subDepartmentId ? Number(subDepartmentId) : null,
        supplierId: supplierId ? Number(supplierId) : null,
        dosageForm: itemType.trim() || undefined,
        unit: unit.trim() || undefined,
        reorderLevel: rol,
        boxQty: box,
        purchasePrice: pp,
        salesPrice: sp,
      });
      setCreated((prev) => [row, ...prev]);
      resetEntryFields();
      // The code just handed out is gone, so pull the next one for the preview.
      api
        .getNextItemNo()
        .then((r) => setNextItemNo(r.itemNo))
        .catch(() => setNextItemNo(""));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-6xl mx-auto space-y-4 text-xs">
          <div className="bg-white border border-slate-300 rounded-lg shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-emerald-700" />
                <div>
                  <h2 className="text-sm font-black text-slate-800">Create Stock</h2>
                  <p className="text-[11px] font-semibold text-slate-500">
                    Adds a new item to the catalog at zero stock. It appears in Stock Data straight away and works like
                    every other item from there on; quantity arrives when a GRN receives it.
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Item No</div>
                <div className="text-base font-black text-slate-900">{nextItemNo || "—"}</div>
                <div className="text-[10px] font-semibold text-slate-400">generated automatically</div>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <SearchableSelect
                  label="Warehouse*"
                  value={warehouseId}
                  onChange={setWarehouseId}
                  placeholder="Select..."
                  options={stores.map((s) => ({ value: String(s.id), label: s.name }))}
                />
                <Field label="Item Name*" className="lg:col-span-2">
                  <input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. NAPA 500MG TABLET"
                    className={inputClass}
                  />
                </Field>
                <SearchableSelect
                  label="Generic (Ingredient)"
                  value={genericName}
                  onChange={setGenericName}
                  placeholder="Type or pick..."
                  allowFreeText
                  options={generics.map((g) => ({ value: g, label: g }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <SearchableSelect
                  label="Display Category"
                  value={displayCategory}
                  onChange={setDisplayCategory}
                  placeholder="Type or pick..."
                  allowFreeText
                  options={categories.map((c) => ({ value: c, label: c }))}
                />
                <SearchableSelect
                  label="Department*"
                  value={departmentId}
                  onChange={handleDepartmentChange}
                  placeholder="Select..."
                  options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                />
                <SearchableSelect
                  label="Sub-Department"
                  value={subDepartmentId}
                  onChange={setSubDepartmentId}
                  placeholder={departmentId ? "Select..." : "Pick a Department first"}
                  options={subDepartments.map((s) => ({ value: String(s.id), label: s.name }))}
                />
                <SearchableSelect
                  label="Manufacturer"
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Select..."
                  options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                <SearchableSelect
                  label="Item Type"
                  value={itemType}
                  onChange={setItemType}
                  placeholder="Type or pick..."
                  allowFreeText
                  options={itemTypes.map((d) => ({ value: d, label: d }))}
                />
                <SearchableSelect
                  label="UOM"
                  value={unit}
                  onChange={setUnit}
                  placeholder="Pcs"
                  allowFreeText
                  options={units.map((u) => ({ value: u, label: u }))}
                />
                <Field label="Re-order Level">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                    className={`${inputClass} text-right`}
                  />
                </Field>
                <Field label="Box Qty">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={boxQty}
                    onChange={(e) => setBoxQty(e.target.value)}
                    className={`${inputClass} text-right`}
                  />
                </Field>
                <Field label="Purchase Price">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    placeholder="0.00"
                    className={`${inputClass} text-right`}
                  />
                </Field>
                <Field label="Sales Price">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={salesPrice}
                    onChange={(e) => setSalesPrice(e.target.value)}
                    placeholder="0.00"
                    className={`${inputClass} text-right`}
                  />
                </Field>
              </div>

              {Number(salesPrice || 0) > 0 && Number(purchasePrice || 0) > Number(salesPrice || 0) && (
                <p className="text-[11px] font-bold text-orange-600">
                  Sales Price is below Purchase Price — Billing will refuse to sell this item until that is fixed.
                </p>
              )}
              {error && (
                <p className="font-bold text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handlePublish}
                  disabled={saving}
                  className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-50 text-slate-900 hover:text-white font-black px-6 py-2 rounded flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <Spinner size="xs" /> PUBLISHING...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      PUBLISH
                    </>
                  )}
                </button>
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="bg-[#dc2626] hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 py-2 rounded"
                >
                  CLEAR
                </button>
                <span className="text-[11px] font-semibold text-slate-500">
                  Purchase Price and Sales Price are recorded against the selected warehouse. Stock Qty always starts at
                  0 — receive quantities through GRN With PO or GRN Without PO.
                </span>
              </div>
            </div>
          </div>

          {created.length > 0 && (
            <div className="bg-white border border-slate-300 rounded-lg shadow-sm">
              <div className="border-b border-slate-200 px-4 py-2.5">
                <h3 className="text-xs font-black text-slate-800">
                  Created in this session ({created.length}) — all searchable in Stock Data now
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap text-xs">
                      <th className="py-2.5 px-3 border border-slate-300">Item No</th>
                      <th className="py-2.5 px-3 border border-slate-300">Item Name</th>
                      <th className="py-2.5 px-3 border border-slate-300">Generic</th>
                      <th className="py-2.5 px-3 border border-slate-300">Display Category</th>
                      <th className="py-2.5 px-3 border border-slate-300">Department</th>
                      <th className="py-2.5 px-3 border border-slate-300">Item Type</th>
                      <th className="py-2.5 px-3 border border-slate-300">UOM</th>
                      <th className="py-2.5 px-3 border border-slate-300 text-right">Re-order Level</th>
                      <th className="py-2.5 px-3 border border-slate-300 text-right">Purchase Price</th>
                      <th className="py-2.5 px-3 border border-slate-300 text-right">Sales Price</th>
                      <th className="py-2.5 px-3 border border-slate-300 text-right">Box Qty</th>
                      <th className="py-2.5 px-3 border border-slate-300 text-right">Stock Qty</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium whitespace-nowrap">
                    {created.map((r) => (
                      <tr key={r.productId} className="odd:bg-white even:bg-slate-50">
                        <td className="py-2.5 px-3 border border-slate-200 font-bold text-emerald-700">{r.itemNo}</td>
                        <td className="py-2.5 px-3 border border-slate-200 font-bold text-slate-900">{r.itemName}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-slate-600">{r.genericName || "—"}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-slate-600">{r.displayCategory || "—"}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-slate-600">{r.department}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-slate-600">{r.itemType || "—"}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-slate-600">{r.unit}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-right text-slate-600">{r.reorderLevel}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-right">{r.purchasePrice.toFixed(2)}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-right">{r.salesPrice.toFixed(2)}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-right">{r.boxQty}</td>
                        <td className="py-2.5 px-3 border border-slate-200 text-right font-bold text-slate-400">
                          {r.stockQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
