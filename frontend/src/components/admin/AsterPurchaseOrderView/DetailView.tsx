"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { PurchaseOrder, RequisitionItemRow } from "../../../types";
import { fmt, fmt4 } from "../../../lib/format";
import { ComboSelect as SearchableSelect, ComboOption } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { CONSUMPTION_DAY_OPTIONS, GRID_FETCH_SIZE, ItemQty, PAYMENT_MODES, statusLabel } from "./types";
import { buildPoReportHtml } from "./report";

// =======================================================
// DETAIL VIEW (edit an approved requisition as an order)
// =======================================================

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  adminName: string;
  orderId: number;
  onBack: () => void;
}> = ({ api, stores, orderId, onBack }) => {
  const { shopName, logoUrl, preparedBySignatureUrl, reviewedBySignatureUrl, approvedBySignatureUrl, shopAddress, shopPhone } = useShopSession();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [deliverToStoreId, setDeliverToStoreId] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [consumptionDays, setConsumptionDays] = useState(30);
  const [remarks, setRemarks] = useState("");

  const [itemQtys, setItemQtys] = useState<Record<number, ItemQty>>({});
  const [itemInfo, setItemInfo] = useState<Map<number, RequisitionItemRow>>(new Map());
  // Order products first got a quantity in — selected rows are always shown
  // in this order at the top of the grid, ahead of everything else (same
  // convention as Purchase Requisition), and it survives re-fetching the
  // grid (e.g. changing Con Days) so already-ordered items never get lost.
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [gridRows, setGridRows] = useState<RequisitionItemRow[]>([]);
  const [gridTotal, setGridTotal] = useState(0);
  const [gridLoading, setGridLoading] = useState(false);

  const [quickAddProductId, setQuickAddProductId] = useState("");
  const [quickAddOrdBox, setQuickAddOrdBox] = useState<number>(0);
  const ordBoxRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  const isFinal = order?.status === "FINAL_APPROVED";

  const loadOrder = useCallback(() => {
    setError(null);
    api
      .getPurchaseOrder(orderId)
      .then((o) => {
        setOrder(o);
        // Defaults to the store the requisition originated from — the user
        // can still change it via the dropdown if delivering elsewhere.
        setDeliverToStoreId(String(o.deliverToStoreId || o.storeId));
        setPaymentMode(o.paymentMode || "");
        setExpectedDate(o.expectedDate ? o.expectedDate.split("T")[0] : "");
        setConsumptionDays(o.consumptionDays);
        setRemarks(o.remarks || "");
        const qtys: Record<number, ItemQty> = {};
        const order: number[] = [];
        const infoEntries: [number, RequisitionItemRow][] = (o.items || []).map((it) => {
          qtys[it.productId] = { qtyBox: it.qtyBox, qtyPieces: it.qtyPieces, remarks: it.remarks || "" };
          order.push(it.productId);
          return [
            it.productId,
            {
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
            },
          ];
        });
        setItemInfo((prev) => new Map([...prev, ...infoEntries]));
        setItemQtys(qtys);
        setSelectedOrder(order);
        // Items already exist on this order (e.g. carried over from the
        // approved requisition, or a prior save) — the next Submit is really
        // an update, so label the button accordingly from the start.
        setHasSubmitted(order.length > 0);
        setNotice(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load purchase order"));
  }, [api, orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Puts every product that currently has a quantity at the top, in the
  // order it was first selected, with the rest of the fetched list below —
  // so re-fetching the grid (e.g. changing Con Days) never loses or
  // reshuffles what's already been ordered.
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
    if (!order) return;
    setGridLoading(true);
    api
      .getRequisitionItems({
        storeId: order.storeId,
        supplierId: order.supplierId,
        mode: order.mode,
        days: consumptionDays,
        page: 1,
        pageSize: GRID_FETCH_SIZE,
      })
      .then((res) => {
        setItemInfo(
          (prev) => new Map([...prev, ...res.rows.map((row): [number, RequisitionItemRow] => [row.productId, row])])
        );
        setGridRows(reorderBySelection(res.rows));
        setGridTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load supplier items"))
      .finally(() => setGridLoading(false));
  }, [api, order, consumptionDays, reorderBySelection]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  const setQty = (productId: number, patch: Partial<ItemQty>) => {
    setItemQtys((prev) => {
      const existing = prev[productId] || { qtyBox: 0, qtyPieces: 0, remarks: "" };
      return { ...prev, [productId]: { ...existing, ...patch } };
    });
  };

  // Item Qty(Box) and Item Qty(Pcs) are two views of the SAME ordered
  // quantity (mirrored via the product's pack size, matching Purchase
  // Requisition and how the backend prices these items) — editing either
  // one recomputes the other; they are not summed.
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

  const removeItem = (productId: number) => {
    setItemQtys((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setSelectedOrder((prev) => prev.filter((pid) => pid !== productId));
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
      // qtyPieces is already the full ordered quantity (see setQtyBox /
      // setQtyPieces above) — it is not added to qtyBox again here.
      const qtyPieces = qty.qtyPieces;
      totalPP += info.ppPerPiece * qtyPieces;
      totalMrp += info.mrpPerPiece * qtyPieces;
      gpSum += info.gpPct;
    });
    return { totalPP, totalMrp, avgGp: selectedItems.length ? gpSum / selectedItems.length : 0 };
  }, [selectedItems]);

  const quickAddInfo = quickAddProductId ? itemInfo.get(Number(quickAddProductId)) : undefined;
  const quickAddOptions: ComboOption[] = useMemo(
    () =>
      gridRows.map((r) => ({
        value: String(r.productId),
        label: r.itemName,
        sublabel: r.itemCode || undefined,
      })),
    [gridRows]
  );

  const handleQuickAdd = () => {
    if (!quickAddInfo) return;
    setQtyBox(quickAddInfo.productId, quickAddInfo.packSize, quickAddOrdBox);
    setQuickAddProductId("");
    setQuickAddOrdBox(0);
  };

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await api.updatePurchaseOrder(orderId, {
        deliverToStoreId: deliverToStoreId ? Number(deliverToStoreId) : null,
        paymentMode: paymentMode || null,
        expectedDate: expectedDate || null,
        consumptionDays,
        remarks: remarks || null,
        items: selectedItems.map(({ productId, qty }) => ({
          productId,
          qtyBox: qty.qtyBox,
          qtyPieces: qty.qtyPieces,
          remarks: qty.remarks || undefined,
        })),
      });
      setOrder(result);
      setNotice("Purchase order saved.");
      setHasSubmitted(true);
      // Move the just-submitted (qty-filled) products to the top of the grid.
      setGridRows((prev) => reorderBySelection(prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save purchase order");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalApprove = async () => {
    setApproving(true);
    setError(null);
    try {
      const result = await api.finalApprovePurchaseOrder(orderId);
      setOrder(result);
      setNotice(`Order ${result.orderNo} final approved.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to final-approve purchase order");
    } finally {
      setApproving(false);
    }
  };

  const handleReport = () => {
    if (!order) return;
    setReportHtml(
      buildPoReportHtml({
        order,
        shopName,
        logoUrl,
        preparedBySignatureUrl,
        reviewedBySignatureUrl,
        approvedBySignatureUrl,
        shopAddress,
        shopPhone,
      })
    );
  };

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-[calc(100vh-3.25rem)] bg-[#f8fafc] text-slate-400 font-bold">
        {error ? error : (
          <>
            <Spinner size="lg" />
            Loading...
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs">
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store*</label>
            <input
              readOnly
              value={order.store?.name || ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">For Store*</label>
            <select
              value={deliverToStoreId}
              disabled={isFinal}
              onChange={(e) => setDeliverToStoreId(e.target.value)}
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
            <label className="font-bold text-slate-700 block mb-1">Order No</label>
            <input
              readOnly
              value={order.orderNo || "Auto-generated on final approval"}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <input
                readOnly
                value={statusLabel(order.status)}
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
            <label className="font-bold text-slate-700 block mb-1">Supplier*</label>
            <input
              readOnly
              value={order.supplier?.name || ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Payment Mode</label>
            <select
              value={paymentMode}
              disabled={isFinal}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              <option value="">Choose...</option>
              {PAYMENT_MODES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Con Days</label>
            <select
              value={consumptionDays}
              disabled={isFinal}
              onChange={(e) => setConsumptionDays(Number(e.target.value))}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              {CONSUMPTION_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} Days
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input
              readOnly
              value={order.finalApprovedBy?.name || "—"}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Req.No</label>
            <input
              readOnly
              value={order.requisitionNo}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Expected Date</label>
            <input
              type="date"
              value={expectedDate}
              disabled={isFinal}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Req.Mode</label>
            <input
              readOnly
              value={order.mode === "PHARMA" ? "Pharma" : "Non-Pharma"}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User Name</label>
            <input
              readOnly
              value={order.createdBy?.name || ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
        </div>

        {(error || notice) && (
          <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>{error || notice}</p>
        )}

        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr_auto] gap-2 items-end mt-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Item Name</label>
            <SearchableSelect
              options={quickAddOptions}
              value={quickAddProductId}
              onChange={(v) => {
                setQuickAddProductId(v);
                setTimeout(() => ordBoxRef.current?.focus(), 0);
              }}
              disabled={isFinal}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">UOM</label>
            <input readOnly value={quickAddInfo?.uom || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pack</label>
            <input readOnly value={quickAddInfo?.packSize ?? ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">ROL</label>
            <input readOnly value={quickAddInfo?.rol ?? ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">MRP/Pcs</label>
            <input readOnly value={quickAddInfo ? fmt(quickAddInfo.mrpPerPiece) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">PP/Pcs</label>
            <input readOnly value={quickAddInfo ? fmt(quickAddInfo.ppPerPiece) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">QOH</label>
            <input readOnly value={quickAddInfo?.qoh ?? ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cons(Box)</label>
            <input readOnly value={quickAddInfo ? quickAddInfo.consumptionBox.toFixed(1) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cons(Pcs)</label>
            <input readOnly value={quickAddInfo?.consumptionPieces ?? ""} className="w-full border border-slate-300 rounded px-2 py-1.5 bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Ord(Box)</label>
            <input
              ref={ordBoxRef}
              type="number"
              min={0}
              disabled={!quickAddInfo || isFinal}
              value={quickAddOrdBox || ""}
              onChange={(e) => setQuickAddOrdBox(Math.max(0, Number(e.target.value) || 0))}
              onKeyDown={(e) => {
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
            disabled={!quickAddInfo || isFinal}
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
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Generic Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">UOM</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Remarks</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">ROL</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">QOH</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Con(Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Con(Pack)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Item Qty(Box)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Item Qty(Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Unit Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Total Values</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">MRP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">GP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">GP%</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[4%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {gridRows.map((r) => {
              const q = itemQtys[r.productId] || { qtyBox: 0, qtyPieces: 0, remarks: "" };
              // qtyPieces is already the full ordered quantity (mirrored with
              // qtyBox via setQtyBox/setQtyPieces) — not added to qtyBox again.
              const totalQtyPieces = q.qtyPieces;
              const totalValue = r.ppPerPiece * totalQtyPieces;
              const hasQty = q.qtyBox > 0 || q.qtyPieces > 0;
              return (
                <tr key={r.productId} className={hasQty ? "bg-emerald-50/70" : "odd:bg-white even:bg-slate-50 hover:bg-slate-100"}>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.itemCode}</td>
                  <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.itemName}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.genericName}</td>
                  <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.uom}</td>
                  <td className="py-2 px-2 border border-slate-200 truncate">
                    <input
                      value={q.remarks}
                      disabled={isFinal}
                      onChange={(e) => setQty(r.productId, { remarks: e.target.value })}
                      className="w-24 border border-slate-300 rounded px-1.5 py-1 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.packSize}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.rol}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.qoh}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-500 truncate">{r.consumptionPieces}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-500 truncate">{r.consumptionBox.toFixed(1)}</td>
                  <td className="py-2 px-2 border border-slate-200 truncate">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      disabled={isFinal}
                      value={q.qtyBox || ""}
                      onChange={(e) => setQtyBox(r.productId, r.packSize, Number(e.target.value) || 0)}
                      className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-2 px-2 border border-slate-200 truncate">
                    <input
                      type="number"
                      min={0}
                      disabled={isFinal}
                      value={q.qtyPieces || ""}
                      onChange={(e) => setQtyPieces(r.productId, r.packSize, Number(e.target.value) || 0)}
                      className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(r.ppPerPiece)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(totalValue)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(r.mrpPerPiece)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(r.gp)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{r.gpPct.toFixed(2)}</td>
                  <td className="py-4 px-3 border border-slate-200 text-center truncate">
                    {hasQty && !isFinal && (
                      <button onClick={() => removeItem(r.productId)} className="text-red-500 hover:text-red-700" title="Remove">
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
          <label className="font-bold text-slate-700 block mb-1">Notes</label>
          <input
            value={remarks}
            disabled={isFinal}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Please Enter Notes.."
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
            onClick={handleFinalApprove}
            disabled={isFinal || approving}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-bold py-2 px-6 rounded"
          >
            {approving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" variant="white" /> APPROVING...
              </span>
            ) : (
              "FINAL APPROVAL"
            )}
          </button>
          <button onClick={handleReport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded">
            REPORT
          </button>
          <button onClick={loadOrder} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded">
            NEW
          </button>
          <button
            onClick={handleSubmit}
            disabled={isFinal || saving}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold py-2 px-6 rounded"
          >
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" /> SAVING...
              </span>
            ) : hasSubmitted ? (
              "UPDATE"
            ) : (
              "SUBMIT"
            )}
          </button>
        </div>
      </div>
      <ReportOverlay html={reportHtml} onClose={() => setReportHtml(null)} />
    </div>
  );
};
