"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { shopApi, ApiError } from "../../../services/api";
import { RequisitionItemRow, RequisitionMode, RequisitionStatus, RequisitionType, Supplier } from "../../../types";
import { Spinner } from "../../../components/Spinner";
import { fmt, fmt4 } from "../../../lib/format";
import { ComboOption } from "../ComboSelect";
import { ItemEntryTypeahead } from "../ItemEntryTypeahead";
import { SearchableSelect } from "./SearchableSelect";
import { DELIVER_TO_OPTIONS, GRID_FETCH_SIZE, ItemQty } from "./types";

// =======================================================
// FORM VIEW (create / edit)
// =======================================================

export const FormView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  adminName: string;
  requisitionId: number | null;
  onBack: () => void;
  onSaved: (id: number) => void;
}> = ({ api, stores, adminName, requisitionId, onBack, onSaved }) => {
  const [id, setId] = useState<number | null>(requisitionId);
  const [requisitionNo, setRequisitionNo] = useState<string>("");
  const [status, setStatus] = useState<RequisitionStatus | null>(null);
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const [storeId, setStoreId] = useState<string>(stores[0] ? String(stores[0].id) : "");
  const [deliverTo, setDeliverTo] = useState(DELIVER_TO_OPTIONS[0]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [mode, setMode] = useState<RequisitionMode | "">("");
  const [reqType, setReqType] = useState<RequisitionType>("REGULAR");
  const [consumptionDays, setConsumptionDays] = useState<number>(30);
  const [reorderBelowOnly, setReorderBelowOnly] = useState(false);
  const [remarks, setRemarks] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [itemQtys, setItemQtys] = useState<Record<number, ItemQty>>({});
  const [itemInfo, setItemInfo] = useState<Map<number, RequisitionItemRow>>(new Map());
  // Order products first got a quantity in — selected rows are always shown
  // in this order at the top of the grid, ahead of everything else, and it
  // survives re-fetching the grid (e.g. toggling Reorder Below off then
  // clicking ADD again) so a cashier's picks never get lost in the reload.
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);

  const [gridRows, setGridRows] = useState<RequisitionItemRow[]>([]);
  const [gridTotal, setGridTotal] = useState(0);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridLoaded, setGridLoaded] = useState(false);

  const [quickAddProductId, setQuickAddProductId] = useState("");
  const [quickAddSearchQuery, setQuickAddSearchQuery] = useState("");
  const [quickAddReqBox, setQuickAddReqBox] = useState<number>(0);
  const reqBoxRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Submitting sets the parent's editingId to our own result, which flows
  // back down as a changed requisitionId prop — without this guard that
  // would re-trigger the edit-load effect below and collapse the grid back
  // down to just the saved items, wiping out the rest of the loaded catalog
  // the admin was still working from.
  const justSubmittedIdRef = useRef<number | null>(null);

  const isApproved = status === "APPROVED";

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load an existing requisition for editing.
  useEffect(() => {
    if (!requisitionId) return;
    if (justSubmittedIdRef.current === requisitionId) {
      justSubmittedIdRef.current = null;
      return;
    }
    setError(null);
    api
      .getRequisition(requisitionId)
      .then((r) => {
        setId(r.id);
        setRequisitionNo(r.requisitionNo);
        setStatus(r.status);
        setApprovedByName(r.approvedBy?.name || null);
        setApprovedAt(r.approvedAt);
        setCreatedAt(r.createdAt);
        setStoreId(String(r.storeId));
        setDeliverTo(r.deliverTo);
        setSupplierId(String(r.supplierId));
        setMode(r.mode);
        setReqType(r.type);
        setConsumptionDays(r.consumptionDays);
        setReorderBelowOnly(r.reorderBelowOnly);
        setRemarks(r.remarks || "");
        const qtys: Record<number, ItemQty> = {};
        const order: number[] = [];
        const rows: RequisitionItemRow[] = [];
        const infoEntries: [number, RequisitionItemRow][] = (r.items || []).map((it) => {
          qtys[it.productId] = { qtyBox: it.qtyBox, qtyPieces: it.qtyPieces, remarks: it.remarks || "" };
          order.push(it.productId);
          const row: RequisitionItemRow = {
            productId: it.productId,
            itemCode: it.product.externalCode,
            itemName: it.product.name,
            genericName: it.product.genericName,
            uom: it.product.unit,
            packSize: it.product.boxQty,
            rol: 0,
            qoh: 0,
            ppPerPiece: it.ppPerPiece,
            mrpPerPiece: it.mrpPerPiece,
            consumptionPieces: 0,
            consumptionBox: 0,
            gp: it.gp,
            gpPct: it.gpPct,
          };
          rows.push(row);
          return [it.productId, row];
        });
        setItemInfo((prev) => new Map([...prev, ...infoEntries]));
        setItemQtys(qtys);
        setSelectedOrder(order);
        // Editing an existing requisition shows only the products already on
        // it — the full supplier catalog only reappears once ADD is clicked,
        // same as a fresh requisition never auto-loading the whole list.
        setGridRows(rows);
        setGridTotal(rows.length);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load requisition"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId]);

  // Puts every product that currently has a quantity at the top, in the
  // order it was first selected, with the rest of the fetched list below —
  // so re-fetching the grid (e.g. unchecking Reorder Below then clicking ADD
  // again) never loses or reshuffles what's already been picked.
  const reorderBySelection = useCallback(
    (rows: RequisitionItemRow[]) => {
      const selectedSet = new Set(selectedOrder);
      const byId = new Map(rows.map((r) => [r.productId, r]));
      const selectedRows = selectedOrder.map((pid) => byId.get(pid)).filter((r): r is RequisitionItemRow => Boolean(r));
      const restRows = rows.filter((r) => !selectedSet.has(r.productId));
      return [...selectedRows, ...restRows];
    },
    [selectedOrder]
  );

  const loadGrid = useCallback(() => {
    if (!storeId || !supplierId) {
      setGridRows([]);
      setGridTotal(0);
      return;
    }
    setGridLoading(true);
    api
      .getRequisitionItems({
        storeId,
        supplierId,
        mode: mode || undefined,
        days: consumptionDays,
        reorderBelow: reorderBelowOnly || undefined,
        page: 1,
        pageSize: GRID_FETCH_SIZE,
      })
      .then((res) => {
        setItemInfo(
          (prev) => new Map([...prev, ...res.rows.map((row): [number, RequisitionItemRow] => [row.productId, row])])
        );
        setGridRows(reorderBySelection(res.rows));
        setGridTotal(res.total);
        setGridLoaded(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load supplier items"))
      .finally(() => setGridLoading(false));
  }, [api, storeId, supplierId, mode, consumptionDays, reorderBelowOnly, reorderBySelection]);

  // Lets a single product be found and added via the Item Name search bar
  // before the supplier's full catalog is loaded — a live, supplier-scoped
  // server search rather than filtering whatever's already in gridRows.
  const fetchQuickAddResults = useCallback(
    async (q: string) => {
      if (!storeId || !supplierId) return [];
      const res = await api.getRequisitionItems({ storeId, supplierId, search: q, page: 1, pageSize: 20 });
      const selectedSet = new Set(selectedOrder);
      return res.rows.filter((r) => !selectedSet.has(r.productId));
    },
    [api, storeId, supplierId, selectedOrder]
  );

  const handleQuickAddSelect = (row: RequisitionItemRow) => {
    setItemInfo((prev) => new Map(prev).set(row.productId, row));
    setQuickAddProductId(String(row.productId));
    setQuickAddSearchQuery(row.itemName);
    setTimeout(() => reqBoxRef.current?.focus(), 0);
  };

  const setQty = (productId: number, patch: Partial<ItemQty>) => {
    setItemQtys((prev) => {
      const existing = prev[productId] || { qtyBox: 0, qtyPieces: 0, remarks: "" };
      return { ...prev, [productId]: { ...existing, ...patch } };
    });
  };

  const removeItem = (productId: number) => {
    setItemQtys((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setSelectedOrder((prev) => prev.filter((pid) => pid !== productId));
  };

  // Item Qty(Box) and Item Qty(Pcs) are two views of the SAME requested
  // quantity (mirrored via the product's pack size), not additive amounts —
  // editing either one recomputes the other, and both inputs stay in sync.
  const setQtyBox = (productId: number, packSize: number, boxVal: number) => {
    const box = Math.max(0, boxVal);
    const pieces = packSize > 0 ? box * packSize : box;
    setQty(productId, { qtyBox: box, qtyPieces: pieces });
    setSelectedOrder((prev) => {
      const isSelected = box > 0 || pieces > 0;
      if (isSelected) return prev.includes(productId) ? prev : [...prev, productId];
      return prev.filter((pid) => pid !== productId);
    });
  };
  const setQtyPieces = (productId: number, packSize: number, piecesVal: number) => {
    const pieces = Math.max(0, piecesVal);
    const box = packSize > 0 ? pieces / packSize : pieces;
    setQty(productId, { qtyBox: box, qtyPieces: pieces });
    setSelectedOrder((prev) => {
      const isSelected = pieces > 0 || box > 0;
      if (isSelected) return prev.includes(productId) ? prev : [...prev, productId];
      return prev.filter((pid) => pid !== productId);
    });
  };

  const selectedItems = useMemo(() => {
    return Object.entries(itemQtys)
      .filter(([, q]) => q.qtyBox > 0 || q.qtyPieces > 0)
      .map(([pid, q]) => {
        const info = itemInfo.get(Number(pid));
        return { productId: Number(pid), qty: q, info };
      })
      .filter((x) => x.info);
  }, [itemQtys, itemInfo]);


  const totals = useMemo(() => {
    let totalPP = 0;
    let totalMrp = 0;
    let gpSum = 0;
    selectedItems.forEach(({ qty, info }) => {
      if (!info) return;
      // qtyPieces is already the full requested quantity (see setQtyBox /
      // setQtyPieces above) — it is not added to qtyBox again here.
      const qtyPieces = qty.qtyPieces;
      totalPP += info.ppPerPiece * qtyPieces;
      totalMrp += info.mrpPerPiece * qtyPieces;
      gpSum += info.gpPct;
    });
    return {
      totalPP,
      totalMrp,
      avgGp: selectedItems.length ? gpSum / selectedItems.length : 0,
    };
  }, [selectedItems]);

  const buildPayload = () => ({
    storeId: Number(storeId),
    deliverTo,
    supplierId: Number(supplierId),
    mode,
    type: reqType,
    consumptionDays,
    reorderBelowOnly,
    remarks: remarks || null,
    items: selectedItems.map(({ productId, qty }) => ({
      productId,
      qtyBox: qty.qtyBox,
      qtyPieces: qty.qtyPieces,
      remarks: qty.remarks || undefined,
    })),
  });

  const handleSubmit = async () => {
    setError(null);
    if (!storeId || !supplierId) {
      setError("Store and Supplier are required");
      return;
    }
    if (!mode) {
      setError("Requisition Mode is required");
      return;
    }
    if (selectedItems.length === 0) {
      setError("Add at least one item with a requested quantity");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const result = id ? await api.updateRequisition(id, payload) : await api.createRequisition(payload);
      justSubmittedIdRef.current = result.id;
      setId(result.id);
      setRequisitionNo(result.requisitionNo);
      setStatus(result.status);
      setCreatedAt(result.createdAt);
      setNotice(`Requisition ${result.requisitionNo} saved.`);
      // Move the just-submitted (qty-filled) products to the top of the grid.
      setGridRows((prev) => reorderBySelection(prev));
      onSaved(result.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save requisition");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    setApproving(true);
    setError(null);
    try {
      const result = await api.approveRequisition(id);
      setStatus(result.status);
      setApprovedByName(result.approvedBy?.name || null);
      setApprovedAt(result.approvedAt);
      setNotice(`Requisition ${result.requisitionNo} approved.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve requisition");
    } finally {
      setApproving(false);
    }
  };

  const handleNew = () => {
    setId(null);
    setRequisitionNo("");
    setStatus(null);
    setApprovedByName(null);
    setApprovedAt(null);
    setCreatedAt(null);
    setDeliverTo(DELIVER_TO_OPTIONS[0]);
    setSupplierId("");
    setMode("");
    setReqType("REGULAR");
    setConsumptionDays(30);
    setReorderBelowOnly(false);
    setRemarks("");
    setItemQtys({});
    setSelectedOrder([]);
    setGridRows([]);
    setGridTotal(0);
    setGridLoaded(false);
    setQuickAddProductId("");
    setQuickAddSearchQuery("");
    setQuickAddReqBox(0);
    setNotice(null);
    setError(null);
  };

  // Changing Store or Supplier invalidates whatever's currently loaded —
  // loadGrid's effect below re-fetches automatically once both are set.
  const resetGridForNewSelection = () => {
    setGridRows([]);
    setGridTotal(0);
    setGridLoaded(false);
  };

  const quickAddInfo = quickAddProductId ? itemInfo.get(Number(quickAddProductId)) : undefined;
  const supplierOptions: ComboOption[] = suppliers.map((s) => ({ value: String(s.id), label: s.name }));

  const handleQuickAdd = () => {
    if (!quickAddInfo) return;
    setQtyBox(quickAddInfo.productId, quickAddInfo.packSize, quickAddReqBox);
    // Individually-searched adds land in the grid immediately (in the order
    // added) even before the supplier's full catalog has been loaded — once
    // it is loaded, reorderBySelection keeps them at the top and excludes
    // them from the rest of the list, same as any other selected row.
    setGridRows((prev) => (prev.some((r) => r.productId === quickAddInfo.productId) ? prev : [...prev, quickAddInfo]));
    setQuickAddProductId("");
    setQuickAddSearchQuery("");
    setQuickAddReqBox(0);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs">
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store*</label>
            <select
              value={storeId}
              disabled={isApproved}
              onChange={(e) => {
                setStoreId(e.target.value);
                resetGridForNewSelection();
              }}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              <option value="">Select...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Req.No</label>
            <input
              value={requisitionNo}
              readOnly
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Requisition Date</label>
            <input
              value={createdAt ? new Date(createdAt).toLocaleString() : ""}
              readOnly
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <input
                value={status ? (status === "APPROVED" ? "Approved" : "Unapproved") : ""}
                readOnly
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
              />
            </div>
            <button
              onClick={onBack}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded shrink-0"
            >
              LIST
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">To Store*</label>
            <select
              value={deliverTo}
              disabled={isApproved}
              onChange={(e) => setDeliverTo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              {DELIVER_TO_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Req.Mode</label>
            <select
              value={mode}
              disabled={isApproved}
              onChange={(e) => setMode(e.target.value as RequisitionMode | "")}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              <option value="">Select Req. Mode</option>
              <option value="PHARMA">Pharma</option>
              <option value="NON_PHARMA">Non-Pharma</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User</label>
            <input
              value={adminName}
              readOnly
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input
              value={approvedByName ? `${approvedByName}${approvedAt ? " — " + new Date(approvedAt).toLocaleString() : ""}` : ""}
              readOnly
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier*</label>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <SearchableSelect
                  options={supplierOptions}
                  value={supplierId}
                  onChange={(v) => {
                    setSupplierId(v);
                    resetGridForNewSelection();
                  }}
                  disabled={isApproved}
                />
              </div>
              <button
                type="button"
                onClick={loadGrid}
                disabled={!storeId || !supplierId || isApproved}
                title="Load this supplier's product list"
                className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold px-4 rounded shrink-0"
              >
                ADD
              </button>
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Req.Type</label>
            <select
              value={reqType}
              disabled={isApproved}
              onChange={(e) => setReqType(e.target.value as RequisitionType)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              <option value="REGULAR">Regular</option>
              <option value="URGENT">Urgent</option>
              <option value="OTHERS">Others</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Con Days</label>
            <select
              value={consumptionDays}
              disabled={isApproved}
              onChange={(e) => setConsumptionDays(Number(e.target.value))}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
              <option value={90}>90 Days</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 pb-1.5">
            <input
              type="checkbox"
              id="reorderBelow"
              checked={reorderBelowOnly}
              disabled={isApproved}
              onChange={(e) => setReorderBelowOnly(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="reorderBelow" className="font-bold text-slate-700">
              Reorder Below
            </label>
          </div>
        </div>

        {(error || notice) && (
          <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>
            {error || notice}
          </p>
        )}

        {/* Quick-add row */}
        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr_auto] gap-2 items-end mt-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Item Name</label>
            <ItemEntryTypeahead<RequisitionItemRow>
              value={quickAddSearchQuery}
              onValueChange={(v) => {
                setQuickAddSearchQuery(v);
                if (quickAddInfo && v !== quickAddInfo.itemName) setQuickAddProductId("");
              }}
              fetchResults={fetchQuickAddResults}
              onSelect={handleQuickAddSelect}
              getKey={(r) => r.productId}
              getLabel={(r) => r.itemName}
              getSublabel={(r) => [r.itemCode, `PP ${fmt(r.ppPerPiece)}`, `MRP ${fmt(r.mrpPerPiece)}`].filter(Boolean).join(" · ")}
              placeholder="Search item..."
              disabled={!storeId || !supplierId || isApproved}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">UOM</label>
            <input
              readOnly
              value={quickAddInfo?.uom || ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pack</label>
            <input
              readOnly
              value={quickAddInfo?.packSize ?? ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">ROL</label>
            <input
              readOnly
              value={quickAddInfo?.rol ?? ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">MRP/pcs</label>
            <input
              readOnly
              value={quickAddInfo ? fmt(quickAddInfo.mrpPerPiece) : ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">PP/pcs</label>
            <input
              readOnly
              value={quickAddInfo ? fmt(quickAddInfo.ppPerPiece) : ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">QOH</label>
            <input
              readOnly
              value={quickAddInfo?.qoh ?? ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cons(Box)</label>
            <input
              readOnly
              value={quickAddInfo ? quickAddInfo.consumptionBox.toFixed(1) : ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cons(pcs)</label>
            <input
              readOnly
              value={quickAddInfo?.consumptionPieces ?? ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Req(Box)</label>
            <input
              ref={reqBoxRef}
              type="number"
              min={0}
              disabled={!quickAddInfo || isApproved}
              value={quickAddReqBox || ""}
              onChange={(e) => setQuickAddReqBox(Math.max(0, Number(e.target.value) || 0))}
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleQuickAdd();
                }
              }}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <button
            onClick={handleQuickAdd}
            disabled={!quickAddInfo || isApproved}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold px-4 py-1.5 rounded shrink-0"
          >
            ADD
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Item Code</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Generic Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">UOM</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">ROL</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">QOH</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Con(Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Con(pack)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Item Qty(Box)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Item Qty(Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">PP/Pcs</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Total Values</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">MRP/Pcs</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">GP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">GP%</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Remark</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[4%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {gridRows.map((r) => {
              const q = itemQtys[r.productId] || { qtyBox: 0, qtyPieces: 0, remarks: "" };
              // Box and Pcs mirror the same quantity (see setQtyBox/setQtyPieces) —
              // Total Values is driven by qtyPieces alone, not the two summed.
              const totalValue = r.ppPerPiece * q.qtyPieces;
              const hasQty = q.qtyBox > 0 || q.qtyPieces > 0;
              return (
                <tr key={r.productId} className={hasQty ? "bg-emerald-50/70" : "odd:bg-white even:bg-slate-50 hover:bg-slate-100"}>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.itemCode}</td>
                  <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.itemName}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.genericName}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.uom}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.packSize}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.rol}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.qoh}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-500 truncate">{r.consumptionPieces}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-500 truncate">{r.consumptionBox.toFixed(1)}</td>
                  <td className="py-2 px-2 border border-slate-200 truncate">
                    <input
                      type="number"
                      min={0}
                      disabled={isApproved}
                      value={q.qtyBox || ""}
                      onKeyDown={(e) => {
                        if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
                      }}
                      onChange={(e) => setQtyBox(r.productId, r.packSize, Number(e.target.value) || 0)}
                      className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-2 px-2 border border-slate-200 truncate">
                    <input
                      type="number"
                      min={0}
                      disabled={isApproved}
                      value={q.qtyPieces || ""}
                      onKeyDown={(e) => {
                        if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
                      }}
                      onChange={(e) => setQtyPieces(r.productId, r.packSize, Number(e.target.value) || 0)}
                      className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(r.ppPerPiece)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(totalValue)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(r.mrpPerPiece)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(r.gp)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.gpPct.toFixed(2)}</td>
                  <td className="py-2 px-2 border border-slate-200 truncate">
                    <input
                      value={q.remarks}
                      disabled={isApproved}
                      onChange={(e) => setQty(r.productId, { remarks: e.target.value })}
                      className="w-24 border border-slate-300 rounded px-1.5 py-1 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-4 px-3 border border-slate-200 text-center truncate">
                    {hasQty && !isApproved && (
                      <button
                        onClick={() => removeItem(r.productId)}
                        className="text-red-500 hover:text-red-700"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {gridRows.length === 0 && (
              <tr>
                <td colSpan={18} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {gridLoading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : !supplierId ? (
                    "Select a Store and Supplier to load the product list."
                  ) : !gridLoaded ? (
                    "Click ADD (next to Supplier) to load this supplier's product list."
                  ) : (
                    "No products found for this supplier."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[#f1f5f9] border-t border-slate-300 px-4 py-1.5 flex items-center justify-end text-xs font-semibold text-slate-600 shrink-0">
        <span>Total Record : </span>
        <span className="font-bold text-slate-900 ml-1">{gridTotal}</span>
      </div>

      <div className="bg-white border-t border-slate-300 p-3 shrink-0 text-xs flex items-start gap-4">
        <div className="flex-1">
          <label className="font-bold text-slate-700 block mb-1">Remarks</label>
          <input
            value={remarks}
            disabled={isApproved}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
          />
        </div>
        <div className="w-72 space-y-1.5 shrink-0">
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
            <span className="text-slate-500 font-bold">Total PP Amount</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalPP)}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
            <span className="text-slate-500 font-bold">Total MRP Amount</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalMrp)}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
            <span className="text-slate-500 font-bold">Avg.GP(%)</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.avgGp)}</span>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-1.5 shrink-0">
          <button
            onClick={handleApprove}
            disabled={!id || isApproved || approving}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-bold py-2 px-6 rounded"
          >
            {approving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" variant="white" /> APPROVING...
              </span>
            ) : (
              "APPROVE"
            )}
          </button>
          <button onClick={handleNew} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded">
            NEW
          </button>
          <button
            onClick={handleSubmit}
            disabled={isApproved || saving}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold py-2 px-6 rounded"
          >
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" /> {id ? "UPDATING..." : "SAVING..."}
              </span>
            ) : id ? (
              "UPDATE"
            ) : (
              "SUBMIT"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
