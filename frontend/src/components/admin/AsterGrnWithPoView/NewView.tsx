"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { shopApi, ApiError } from "../../../services/api";
import { PurchaseOrderOption, Supplier } from "../../../types";
import { Spinner } from "../../../components/Spinner";
import { fmt, fmt4, round4 } from "../../../lib/format";
import { ComboSelect as SearchableSelect, ComboOption } from "../ComboSelect";
import { GrnItemDraft, PAYMENT_TYPES } from "./types";
import { splitProportionally } from "../../../lib/proportionalSplit";

// =======================================================
// NEW VIEW — same full-page layout as DetailView, shown
// immediately when the page loads. Picking an Order No loads
// that PO's priced item grid right here so it can be reviewed
// and edited before SUBMIT creates the GRN with those items.
// =======================================================

export const NewView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  onBack: () => void;
  onCreated: (id: number) => void;
}> = ({ api, stores, onBack, onCreated }) => {
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState("");
  const [receivedById, setReceivedById] = useState("");
  const [remarks, setRemarks] = useState("");
  const [transactionRefNo, setTransactionRefNo] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [invoiceVat, setInvoiceVat] = useState(0);
  const [expiryAdjustmentAmount, setExpiryAdjustmentAmount] = useState(0);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderOption[]>([]);
  const [items, setItems] = useState<GrnItemDraft[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!supplierId) { setOrders([]); return; }
    api
      .getGrnPurchaseOrders({ storeId: storeId || undefined, supplierId, from: from || undefined, to: to || undefined })
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [api, storeId, supplierId, from, to]);

  const orderOptions: ComboOption[] = orders.map((o) => ({
    value: String(o.id),
    label: o.orderNo || `Order #${o.id}`,
    sublabel: `${o.finalApprovedAt ? new Date(o.finalApprovedAt).toLocaleDateString() : ""} — ${fmt(o.totalPPAmount)}`,
  }));

  // Picking an Order No loads that PO's priced item grid immediately, store-
  // scoped to wherever the PO is destined for — so the page shows exactly
  // what will be received before SUBMIT, not only after creating blind.
  const handlePickOrder = (v: string) => {
    setPurchaseOrderId(v);
    const picked = orders.find((o) => String(o.id) === v);
    if (picked) setStoreId(String(picked.store.id));
    if (!v || !picked) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    setError(null);
    api
      .getGrnPurchaseOrderItems(Number(v), picked.store.id)
      .then((rows) => {
        setItems(
          rows.map((it) => ({
            productId: it.productId,
            itemCode: it.itemCode,
            itemName: it.itemName,
            genericName: it.genericName,
            displayCategory: it.displayCategorySnapshot,
            uom: it.uom,
            packSize: it.packSize,
            orderQtyPieces: it.orderQtyPieces,
            rcvQtyBox: it.rcvQtyBox,
            rcvQtyPieces: it.rcvQtyPieces,
            bonusQtyPieces: it.bonusQtyPieces,
            tradePrice: it.tradePrice,
            // Seeded from the PO's own pricing; both boxes are editable from
            // here so an invoice that differs from the order can be keyed in.
            totalValue: it.totalValue,
            unitPrice: it.rcvQtyPieces > 0 ? round4(it.totalValue / it.rcvQtyPieces) : it.tradePrice,
            vatAmt: it.vatAmt,
            discAmt: it.discAmt,
            mrp: it.mrp,
            batchNo: it.batchNo || "",
            expiryDate: it.expiryDate ? it.expiryDate.split("T")[0] : "",
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load Purchase Order items"))
      .finally(() => setLoadingItems(false));
  };

  const setItem = (productId: number, patch: Partial<GrnItemDraft>) => {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));
  };

  // === Price entry: Total Value and Unit Price are two views of one figure ===
  // Editing either recomputes the other against the received quantity, and
  // changing the received quantity keeps the unit price and rescales the total.
  // Only the field the user typed is stored verbatim; the partner is rounded,
  // so typing 100 into Total Value against 3 pieces keeps 100 exactly and shows
  // 33.3333 as the unit price rather than 33.33333333333336.
  const setUnitPrice = (it: GrnItemDraft, value: number) => {
    const unitPrice = Math.max(0, value);
    setItem(it.productId, { unitPrice, totalValue: round4(unitPrice * it.rcvQtyPieces) });
  };

  const setTotalValue = (it: GrnItemDraft, value: number) => {
    const totalValue = Math.max(0, value);
    setItem(it.productId, {
      totalValue,
      // With nothing received there's no per-unit price to derive; keep the one
      // already in the box so it isn't wiped while the row is still being filled in.
      unitPrice: it.rcvQtyPieces > 0 ? round4(totalValue / it.rcvQtyPieces) : it.unitPrice,
    });
  };

  const setReceivedPieces = (it: GrnItemDraft, value: number) => {
    const rcvQtyPieces = Math.max(0, value);
    setItem(it.productId, { rcvQtyPieces, totalValue: round4(it.unitPrice * rcvQtyPieces) });
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const computed = useMemo(() => {
    return items.map((it) => {
      // RcvQty (Box) is an informational "received as N boxes" note, not an
      // additive amount on top of RcvQty (Pcs) — Pcs alone is the actual
      // received quantity (mirrors the backend's own computeItem(), and how
      // stock is incremented on approval).
      const totalQtyPieces = it.rcvQtyPieces + it.bonusQtyPieces;
      // Bonus units are free stock from the supplier — they grow Total Qty
      // (and stock on approval) but don't count toward what's owed, so
      // pricing is based on rcvQtyPieces alone (mirrors the backend's
      // computeItem() with bonusAffectsPricing: false, and matches how GRN
      // Without PO already treats bonus).
      //
      // Total Value is now typed in (or derived from a typed Unit Price)
      // instead of being recomputed from the PO price, so an invoice that
      // came in at a different rate is entered as-is.
      const totalValue = it.totalValue;
      const netTotal = totalValue + it.vatAmt - it.discAmt;
      const unitPrice = it.unitPrice;
      const gp = it.mrp - unitPrice;
      const gpPct = it.mrp > 0 ? (gp / it.mrp) * 100 : 0;
      return { ...it, totalQtyPieces, totalValue, netTotal, unitPrice, gp, gpPct };
    });
  }, [items]);

  const totals = useMemo(() => {
    const totalTradeValue = computed.reduce((a, i) => a + i.totalValue, 0);
    const totalVat = computed.reduce((a, i) => a + i.vatAmt, 0);
    const totalDiscount = computed.reduce((a, i) => a + i.discAmt, 0);
    const netAmount = computed.reduce((a, i) => a + i.netTotal, 0) - expiryAdjustmentAmount;
    const avgGpPct = computed.length ? computed.reduce((a, i) => a + i.gpPct, 0) / computed.length : 0;
    return { totalTradeValue, totalVat, totalDiscount, netAmount, avgGpPct };
  }, [computed, expiryAdjustmentAmount]);

  const applyCalculate = (discount: number, vat: number) => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      // Weighted by what each line was actually invoiced at, not by the PO's
      // price — otherwise an edited line would take a share of the invoice
      // discount/VAT sized against a price that is no longer on the document.
      const weights = prev.map((it) => it.totalValue);
      const discAmts = splitProportionally(discount, weights);
      const vatAmts = splitProportionally(vat, weights);
      return prev.map((it, idx) => ({ ...it, discAmt: discAmts[idx], vatAmt: vatAmts[idx] }));
    });
  };
  const handleCalculate = () => applyCalculate(invoiceDiscount, invoiceVat);

  const canCreate = storeId && supplierId && purchaseOrderId && invoiceNo && invoiceDate && paymentType;

  const handleCreate = async () => {
    setError(null);
    setSaving(true);
    try {
      const grn = await api.createGrn({
        storeId: Number(storeId),
        supplierId: Number(supplierId),
        purchaseOrderId: Number(purchaseOrderId),
        invoiceNo,
        invoiceDate,
        paymentType,
        receivedById: receivedById ? Number(receivedById) : undefined,
        transactionRefNo: transactionRefNo || undefined,
        remarks: remarks || undefined,
        invoiceDiscount,
        invoiceVat,
        expiryAdjustmentAmount,
        items: items.map((it) => ({
          productId: it.productId,
          rcvQtyBox: it.rcvQtyBox,
          rcvQtyPieces: it.rcvQtyPieces,
          bonusQtyBox: 0,
          bonusQtyPieces: it.bonusQtyPieces,
          // Sent so the typed price sticks: the backend takes this as
          // totalValueOverride instead of recomputing PO price x qty.
          totalValue: it.totalValue,
          vatAmt: it.vatAmt,
          discAmt: it.discAmt,
          mrp: it.mrp,
          batchNo: it.batchNo || undefined,
          expiryDate: it.expiryDate || undefined,
        })),
      });
      onCreated(grn.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create GRN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">

      {/* ── Header fields ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs">

        {/* Row 1: Store | Invoice No. | Trans. No | Status + LIST */}
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store*</label>
            <select
              value={storeId}
              onChange={(e) => { setStoreId(e.target.value); setPurchaseOrderId(""); setItems([]); }}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select...</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Invoice No.*</label>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans. No</label>
            <input readOnly value="" className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-400" />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <input readOnly value="" className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-400" />
            </div>
            <button onClick={onBack} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded shrink-0">
              LIST
            </button>
          </div>
        </div>

        {/* Row 2: Supplier | Invoice Date | Trans. Date | Approved By */}
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier*</label>
            <SearchableSelect
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
              value={supplierId}
              onChange={(v) => { setSupplierId(v); setPurchaseOrderId(""); setItems([]); }}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans. Date</label>
            <input readOnly value="" className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-400" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input readOnly value="" className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-400" />
          </div>
        </div>

        {/* Row 3: Order No | Pay Type | User Name | Approved Date */}
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Order No*</label>
            <SearchableSelect
              options={orderOptions}
              value={purchaseOrderId}
              onChange={handlePickOrder}
              disabled={!supplierId}
              placeholder={!supplierId ? "Select Supplier first" : loadingItems ? "Loading items..." : "Select..."}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pay Type</label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Choose...</option>
              {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User Name</label>
            <input readOnly value="" className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-400" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved Date</label>
            <input readOnly value="" className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-400" />
          </div>
        </div>

        {/* Row 4: From Date | To Date | Received By */}
        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">From Date</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">To Date</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Received by*</label>
            <select
              value={receivedById}
              onChange={(e) => setReceivedById(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select...</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trn. Ref. No</label>
            <input value={transactionRefNo} onChange={(e) => setTransactionRefNo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
        </div>

        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      {/* ── Items table ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[3%] truncate">Sl</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Item No</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Display Category</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Ord Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">RcvQty (Box)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">RcvQty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Bonus Qty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Total Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Prev. Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Total Value</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">VAT</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Discount</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Unit Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">MRP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">GP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">GP(%)</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Batch</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Exp. Date</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Net Total</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[3%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {computed.map((it, idx) => (
              <tr key={it.productId} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                <td className="py-4 px-3 border border-slate-200 text-slate-500 truncate">{idx + 1}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.itemCode}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{it.itemName}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.displayCategory}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.packSize}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.orderQtyPieces}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    value={it.rcvQtyBox || ""}
                    onChange={(e) => setItem(it.productId, { rcvQtyBox: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    value={it.rcvQtyPieces || ""}
                    onChange={(e) => setReceivedPieces(it, Number(e.target.value) || 0)}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    value={it.bonusQtyPieces || ""}
                    onChange={(e) => setItem(it.productId, { bonusQtyPieces: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-700 truncate">{it.totalQtyPieces}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.tradePrice)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.totalValue || ""}
                    onChange={(e) => setTotalValue(it, Number(e.target.value) || 0)}
                    title="Total Value — editing this recalculates Unit Price as Total Value ÷ RcvQty (Pcs)"
                    className="w-20 border border-slate-300 rounded px-1.5 py-1 text-right font-bold"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    value={it.vatAmt || ""}
                    onChange={(e) => setItem(it.productId, { vatAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    value={it.discAmt || ""}
                    onChange={(e) => setItem(it.productId, { discAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.unitPrice || ""}
                    onChange={(e) => setUnitPrice(it, Number(e.target.value) || 0)}
                    title="Unit Price — editing this recalculates Total Value as Unit Price × RcvQty (Pcs)"
                    className="w-20 border border-slate-300 rounded px-1.5 py-1 text-right font-bold"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    value={it.mrp || ""}
                    onChange={(e) => setItem(it.productId, { mrp: Number(e.target.value) || 0 })}
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.gp)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.gpPct.toFixed(2)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    value={it.batchNo}
                    onChange={(e) => setItem(it.productId, { batchNo: e.target.value })}
                    placeholder="Batch No*"
                    className={`w-24 border rounded px-1.5 py-1 ${it.totalQtyPieces > 0 && !it.batchNo ? "border-red-400" : "border-slate-300"}`}
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="date"
                    value={it.expiryDate}
                    onChange={(e) => setItem(it.productId, { expiryDate: e.target.value })}
                    className={`w-28 border rounded px-1.5 py-1 ${it.totalQtyPieces > 0 && !it.expiryDate ? "border-red-400" : "border-slate-300"}`}
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(it.netTotal)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  <button onClick={() => removeItem(it.productId)} className="text-red-500 hover:text-red-700" title="Remove">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={21} className="py-16 border border-slate-200 text-center text-slate-400 font-semibold text-xs">
                  {loadingItems ? "Loading Purchase Order items..." : "Select an Order No above to load its items."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Total Item bar ────────────────────────────────────────────── */}
      <div className="bg-[#f1f5f9] border-t border-slate-300 px-4 py-1.5 flex items-center justify-end text-xs font-semibold text-slate-600 shrink-0">
        <span>Total Item : </span>
        <span className="font-bold text-slate-900 ml-1">{computed.length}</span>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="bg-white border-t border-slate-300 p-3 shrink-0 text-xs flex items-start gap-4">

        {/* Left: Remarks + controls row */}
        <div className="flex-1 space-y-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Remarks</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div className="flex items-end gap-2.5 flex-wrap">
            <div className="w-32">
              <label className="font-bold text-slate-700 block mb-1">Invoice Discount</label>
              <input
                type="number"
                value={invoiceDiscount || ""}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setInvoiceDiscount(v);
                  applyCalculate(v, invoiceVat);
                }}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold text-right"
              />
            </div>
            <div className="w-32">
              <label className="font-bold text-slate-700 block mb-1">Invoice VAT</label>
              <input
                type="number"
                value={invoiceVat || ""}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setInvoiceVat(v);
                  applyCalculate(invoiceDiscount, v);
                }}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold text-right"
              />
            </div>
            <button
              type="button"
              onClick={handleCalculate}
              className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold px-5 py-1.5 rounded"
            >
              CALCULATE
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-1.5 rounded">
              Choose File
            </button>
            <div className="w-32">
              <label className="font-bold text-slate-700 block mb-1">Exp. Adjustment</label>
              <input
                type="number"
                value={expiryAdjustmentAmount || ""}
                onChange={(e) => setExpiryAdjustmentAmount(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold text-right"
              />
            </div>
            <div className="w-28">
              <label className="font-bold text-slate-700 block mb-1">Avg.GP(%)</label>
              <input readOnly value={fmt4(totals.avgGpPct)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-right" />
            </div>
          </div>
        </div>

        {/* Right: Totals panel */}
        <div className="w-64 space-y-1 shrink-0 text-xs font-semibold">
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500">Total Amount</span>
            <span className="text-slate-900">{fmt4(totals.totalTradeValue)}</span>
          </div>
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500">Total VAT</span>
            <span className="text-slate-900">{fmt4(totals.totalVat)}</span>
          </div>
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500">Total Discount</span>
            <span className="text-slate-900">{fmt4(totals.totalDiscount)}</span>
          </div>
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500">Net Amount</span>
            <span className="text-slate-900">{fmt4(totals.netAmount)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col justify-end gap-1.5 shrink-0">
          <button disabled className="bg-teal-600 disabled:opacity-40 text-white font-bold py-2 px-6 rounded">
            APPROVE
          </button>
          <button disabled className="bg-red-600 disabled:opacity-40 text-white font-bold py-2 px-6 rounded">
            NEW
          </button>
          <button disabled className="bg-blue-600 disabled:opacity-40 text-white font-bold py-2 px-6 rounded">
            REPORT
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || saving}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold py-2 px-6 rounded"
          >
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" /> CREATING...
              </span>
            ) : (
              "SUBMIT"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
