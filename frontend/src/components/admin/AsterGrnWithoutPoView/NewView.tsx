"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { shopApi, ApiError } from "../../../services/api";
import { RequisitionItemRow, Supplier } from "../../../types";
import { Spinner } from "../../../components/Spinner";
import { ComboSelect as SearchableSelect } from "../ComboSelect";
import { ItemEntryTypeahead } from "../ItemEntryTypeahead";
import { fmt, fmt4 } from "../../../lib/format";
import { GrnItemDraft, PAYMENT_TYPES } from "./types";
import { splitProportionally } from "../../../lib/proportionalSplit";

// =======================================================
// NEW VIEW — same full-page layout as DetailView but in
// "create" mode. The header fields are editable, and items can
// be searched/staged here too (store-scoped search, same as
// Detail) — SUBMIT creates the GRN with whatever items were
// staged and transitions to detail. You can also skip staging
// items and add them afterward on the Detail page instead.
// =======================================================

export const NewView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  onBack: () => void;
  onCreated: (id: number) => void;
}> = ({ api, stores, onBack, onCreated }) => {
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState("");
  const [receivedById, setReceivedById] = useState("");
  const [transactionRefNo, setTransactionRefNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [invoiceVat, setInvoiceVat] = useState(0);
  const [expiryAdjustmentAmount, setExpiryAdjustmentAmount] = useState(0);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Item entry staging — same pattern as DetailView, just store-scoped only
  // (no grnId to attach to yet; items are sent together with SUBMIT).
  const [items, setItems] = useState<GrnItemDraft[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stagedRow, setStagedRow] = useState<RequisitionItemRow | null>(null);
  const [stagedQty, setStagedQty] = useState("");
  const [stagedBonusQty, setStagedBonusQty] = useState("");
  const [stagedVat, setStagedVat] = useState("");
  const [stagedDiscount, setStagedDiscount] = useState("");
  const [stagedBatch, setStagedBatch] = useState("");
  const [stagedExpiry, setStagedExpiry] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchItemResults = useCallback(
    async (q: string) => {
      if (!storeId) return [];
      const res = await api.getGrnwItems({ storeId, search: q });
      return res.rows.filter((r) => !items.some((it) => it.productId === r.productId));
    },
    [api, storeId, items]
  );

  const handleSelectItem = (row: RequisitionItemRow) => {
    setStagedRow(row);
    setSearchQuery(row.itemName);
    setStagedQty("");
    setStagedBonusQty("");
    setStagedVat("");
    setStagedDiscount("");
    setStagedBatch("");
    setStagedExpiry("");
    setTimeout(() => qtyInputRef.current?.focus(), 0);
  };

  const commitStagedItem = () => {
    if (!stagedRow) return;
    const qty = Math.max(0, Number(stagedQty) || 0);
    setItems((prev) => [
      ...prev,
      {
        productId: stagedRow.productId,
        itemCode: stagedRow.itemCode,
        itemName: stagedRow.itemName,
        genericName: stagedRow.genericName,
        displayCategory: null,
        uom: stagedRow.uom,
        packSize: stagedRow.packSize,
        rcvQtyBox: stagedRow.packSize > 0 ? qty / stagedRow.packSize : qty,
        rcvQtyPieces: qty,
        bonusQtyPieces: Math.max(0, Number(stagedBonusQty) || 0),
        tradePrice: stagedRow.ppPerPiece,
        totalValue: stagedRow.ppPerPiece * qty,
        vatAmt: Math.max(0, Number(stagedVat) || 0),
        discAmt: Math.max(0, Number(stagedDiscount) || 0),
        mrp: stagedRow.mrpPerPiece,
        batchNo: stagedBatch,
        expiryDate: stagedExpiry,
      },
    ]);
    setStagedRow(null);
    setSearchQuery("");
    setStagedQty("");
    setStagedBonusQty("");
    setStagedVat("");
    setStagedDiscount("");
    setStagedBatch("");
    setStagedExpiry("");
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const setItem = (productId: number, patch: Partial<GrnItemDraft>) => {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));
  };

  const setRcvQtyBox = (productId: number, packSize: number, tradePrice: number, boxVal: number) => {
    const box = Math.max(0, boxVal);
    const pieces = packSize > 0 ? box * packSize : box;
    setItem(productId, { rcvQtyBox: box, rcvQtyPieces: pieces, totalValue: tradePrice * pieces });
  };
  const setRcvQtyPieces = (productId: number, packSize: number, tradePrice: number, piecesVal: number) => {
    const pieces = Math.max(0, piecesVal);
    const box = packSize > 0 ? pieces / packSize : pieces;
    setItem(productId, { rcvQtyBox: box, rcvQtyPieces: pieces, totalValue: tradePrice * pieces });
  };

  const computed = useMemo(() => {
    return items.map((it) => {
      const totalQtyPieces = it.rcvQtyPieces + it.bonusQtyPieces;
      const netTotal = it.totalValue + it.vatAmt - it.discAmt;
      const unitPrice = it.rcvQtyPieces > 0 ? netTotal / it.rcvQtyPieces : it.tradePrice;
      const gp = it.mrp - unitPrice;
      const gpPct = it.mrp > 0 ? (gp / it.mrp) * 100 : 0;
      return { ...it, totalQtyPieces, netTotal, unitPrice, gp, gpPct };
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
      const weights = prev.map((it) => it.totalValue);
      const discAmts = splitProportionally(discount, weights);
      const vatAmts = splitProportionally(vat, weights);
      return prev.map((it, idx) => ({ ...it, discAmt: discAmts[idx], vatAmt: vatAmts[idx] }));
    });
  };
  const handleCalculate = () => applyCalculate(invoiceDiscount, invoiceVat);

  const canCreate = storeId && supplierId && invoiceNo && invoiceDate && paymentType && receivedById;

  const handleCreate = async () => {
    setError(null);
    setSaving(true);
    try {
      const grn = await api.createGrnw({
        storeId: Number(storeId),
        supplierId: Number(supplierId),
        invoiceNo,
        invoiceDate,
        paymentType,
        receivedById: Number(receivedById),
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
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Invoice No*</label>
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
              onChange={setSupplierId}
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

        {/* Row 3: Received By | Pay Type | User Name | Approved Date */}
        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Received By*</label>
            <select
              value={receivedById}
              onChange={(e) => setReceivedById(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select...</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pay Type</label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Choose...</option>
              {PAYMENT_TYPES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
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

        {(error) && <p className="font-bold text-xs mt-2 text-red-600">{error}</p>}
        {!storeId && <p className="font-bold text-xs mt-2 text-amber-600">Select a Store first to search items.</p>}

        {/* Item entry row */}
        <div className="grid gap-2.5 items-end mt-2.5" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto" }}>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Item Name</label>
            <ItemEntryTypeahead<RequisitionItemRow>
              value={searchQuery}
              onValueChange={(v) => {
                setSearchQuery(v);
                if (stagedRow && v !== stagedRow.itemName) setStagedRow(null);
              }}
              fetchResults={fetchItemResults}
              onSelect={handleSelectItem}
              getKey={(r) => r.productId}
              getLabel={(r) => r.itemName}
              getSublabel={(r) => [r.itemCode, `PP ${fmt(r.ppPerPiece)}`, `MRP ${fmt(r.mrpPerPiece)}`].filter(Boolean).join(" · ")}
              placeholder="Search item..."
              disabled={!storeId}
              inputRef={searchInputRef}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">UOM</label>
            <input readOnly value={stagedRow?.uom || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pack</label>
            <input readOnly value={stagedRow?.packSize ?? ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">PP</label>
            <input readOnly value={stagedRow ? fmt(stagedRow.ppPerPiece) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">MRP</label>
            <input readOnly value={stagedRow ? fmt(stagedRow.mrpPerPiece) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Rcv.Qty (Pcs)</label>
            <input
              ref={qtyInputRef}
              type="number"
              min={0}
              value={stagedQty}
              onChange={(e) => setStagedQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitStagedItem();
                }
              }}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <button
            onClick={commitStagedItem}
            disabled={!stagedRow}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold px-4 py-1.5 rounded h-[34px]"
          >
            + ADD
          </button>
        </div>
        <div className="grid gap-2.5 items-end mt-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr" }}>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Bonus Qty</label>
            <input
              type="number"
              min={0}
              value={stagedBonusQty}
              onChange={(e) => setStagedBonusQty(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Total Amount</label>
            <input
              readOnly
              value={stagedRow ? fmt(stagedRow.ppPerPiece * (Number(stagedQty) || 0)) : ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">VAT</label>
            <input
              type="number"
              min={0}
              value={stagedVat}
              onChange={(e) => setStagedVat(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Discount</label>
            <input
              type="number"
              min={0}
              value={stagedDiscount}
              onChange={(e) => setStagedDiscount(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Batch</label>
            <input
              value={stagedBatch}
              onChange={(e) => setStagedBatch(e.target.value)}
              placeholder="Batch No*"
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Exp. Date</label>
            <input
              type="date"
              value={stagedExpiry}
              onChange={(e) => setStagedExpiry(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
        </div>
      </div>

      {/* ── Items table ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[3%] truncate">Sl</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Item No</th>
              <th className="py-4 px-3 border border-slate-300 w-[10%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Display Category</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">RcvQty (Box)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">RcvQty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Bonus Qty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Total Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Prev. Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Total Value</th>
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
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input readOnly value={it.packSize || ""} className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right bg-slate-100" />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={it.rcvQtyBox || ""}
                    onChange={(e) => setRcvQtyBox(it.productId, it.packSize, it.tradePrice, Number(e.target.value) || 0)}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    value={it.rcvQtyPieces || ""}
                    onChange={(e) => setRcvQtyPieces(it.productId, it.packSize, it.tradePrice, Number(e.target.value) || 0)}
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
                    value={it.totalValue || ""}
                    onChange={(e) => setItem(it.productId, { totalValue: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right"
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
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(it.unitPrice)}</td>
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
                  No items staged yet. Search above to add items, or SUBMIT now and add items on the next page.
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
        {/* Left: Remarks + Discount/VAT/CALCULATE row */}
        <div className="flex-1 space-y-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Remarks</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div className="flex items-end gap-2.5">
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
          </div>
          <div className="flex items-end gap-2.5">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Trn. Ref. No</label>
              <input value={transactionRefNo} onChange={(e) => setTransactionRefNo(e.target.value)} className="w-40 border border-slate-300 rounded px-2 py-1.5 font-semibold" />
            </div>
            <div className="w-28">
              <label className="font-bold text-slate-700 block mb-1">Adjustment</label>
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

        {/* Right: Totals */}
        <div className="w-64 space-y-1.5 shrink-0">
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500 font-bold">Total Amount</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalTradeValue)}</span>
          </div>
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500 font-bold">Total VAT</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalVat)}</span>
          </div>
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500 font-bold">Total Discount</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalDiscount)}</span>
          </div>
          <div className="flex justify-between items-center px-1 py-1">
            <span className="text-slate-500 font-bold">Net Amount</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.netAmount)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col justify-end gap-1.5 shrink-0">
          <button disabled className="bg-teal-600 disabled:opacity-40 text-white font-bold py-2 px-6 rounded">
            APPROVE
          </button>
          <button disabled className="bg-blue-600 disabled:opacity-40 text-white font-bold py-2 px-6 rounded">
            REPORT
          </button>
          <button disabled className="bg-red-600 disabled:opacity-40 text-white font-bold py-2 px-6 rounded">
            NEW
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
