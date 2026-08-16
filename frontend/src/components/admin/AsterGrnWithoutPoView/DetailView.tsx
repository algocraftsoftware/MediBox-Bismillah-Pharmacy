"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Grn, RequisitionItemRow } from "../../../types";
import { ItemEntryTypeahead } from "../ItemEntryTypeahead";
import { fmt, fmt4 } from "../../../lib/format";
import { ReportOverlay } from "../ReportOverlay";
import { GrnItemDraft, PAYMENT_TYPES, statusLabel, toDateInput } from "./types";
import { buildGrnwReportHtml } from "./report";
import { splitProportionally } from "../../../lib/proportionalSplit";

// =======================================================
// DETAIL VIEW (add items, submit / approve / cancel / print)
// =======================================================

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  grnId: number;
  onBack: () => void;
}> = ({ api, grnId, onBack }) => {
  const { shopName, logoUrl, adminName } = useShopSession();
  const [grn, setGrn] = useState<Grn | null>(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [transactionRefNo, setTransactionRefNo] = useState("");
  const [receivedById, setReceivedById] = useState("");
  const [remarks, setRemarks] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [invoiceVat, setInvoiceVat] = useState(0);
  const [expiryAdjustmentAmount, setExpiryAdjustmentAmount] = useState(0);

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

  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const isLocked = grn?.status === "APPROVED" || grn?.status === "CANCELED";

  const loadGrn = useCallback(() => {
    setError(null);
    api
      .getGrnw(grnId)
      .then((g) => {
        setGrn(g);
        setInvoiceNo(g.invoiceNo);
        setInvoiceDate(toDateInput(g.invoiceDate));
        setPaymentType(g.paymentType);
        setTransactionRefNo(g.transactionRefNo || "");
        setReceivedById(g.receivedById ? String(g.receivedById) : "");
        setRemarks(g.remarks || "");
        setInvoiceDiscount(g.invoiceDiscount);
        setInvoiceVat(g.invoiceVat);
        setExpiryAdjustmentAmount(g.expiryAdjustmentAmount);
        setItems(
          (g.items || []).map((it) => ({
            productId: it.productId,
            itemCode: it.product.externalCode,
            itemName: it.product.name,
            genericName: it.product.genericName,
            displayCategory: it.displayCategorySnapshot,
            uom: it.product.unit,
            packSize: it.product.boxQty,
            rcvQtyBox: it.rcvQtyBox,
            rcvQtyPieces: it.rcvQtyPieces,
            bonusQtyPieces: it.bonusQtyPieces,
            tradePrice: it.tradePrice,
            totalValue: it.totalValue,
            vatAmt: it.vatAmt,
            discAmt: it.discAmt,
            mrp: it.mrp,
            batchNo: it.batchNo || "",
            expiryDate: toDateInput(it.expiryDate),
          }))
        );
        setNotice(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load GRN"));
  }, [api, grnId]);

  useEffect(() => {
    loadGrn();
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGrn]);

  const setItem = (productId: number, patch: Partial<GrnItemDraft>) => {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));
  };

  // rcvQtyBox and rcvQtyPieces are two synced views of the SAME received
  // quantity (mirrored via the product's box size, like Purchase
  // Requisition's qtyBox/qtyPieces) — editing either one recomputes the
  // other, and Total Qty is driven by rcvQtyPieces alone (not both summed).
  // Total Value re-defaults to tradePrice*pieces on every qty change (a
  // convenience starting point) but stays independently editable afterward.
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
  const setPackSize = (productId: number, rcvQtyPieces: number, newPackSize: number) => {
    const packSize = Math.max(0, newPackSize);
    const rcvQtyBox = packSize > 0 ? rcvQtyPieces / packSize : rcvQtyPieces;
    setItem(productId, { packSize, rcvQtyBox });
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const fetchItemResults = useCallback(
    async (q: string) => {
      if (!grn) return [];
      const res = await api.getGrnwItems({ storeId: grn.storeId, search: q });
      return res.rows.filter((r) => !items.some((it) => it.productId === r.productId));
    },
    [api, grn, items]
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
    // Total Discount is the sum of each item's own Discount cell — CALCULATE
    // spreads the Invoice Discount/VAT boxes down into those cells, so this
    // (and Avg GP%) already reflect them without double-subtracting again.
    const totalDiscount = computed.reduce((a, i) => a + i.discAmt, 0);
    const netAmount = computed.reduce((a, i) => a + i.netTotal, 0) - expiryAdjustmentAmount;
    const avgGpPct = computed.length ? computed.reduce((a, i) => a + i.gpPct, 0) / computed.length : 0;
    return { totalTradeValue, totalVat, totalDiscount, netAmount, avgGpPct };
  }, [computed, expiryAdjustmentAmount]);

  // Called directly from the Invoice Discount/VAT inputs' onChange (with the
  // just-typed value) so the spread applies live as you type, not only when
  // CALCULATE is clicked — CALCULATE stays as an explicit re-apply.
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

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await api.updateGrnw(grnId, {
        invoiceNo,
        invoiceDate,
        paymentType,
        transactionRefNo: transactionRefNo || undefined,
        receivedById: Number(receivedById),
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
      setGrn(result);
      setNotice("GRN saved.");
      setHasSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save GRN");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    try {
      const result = await api.approveGrnw(grnId);
      setGrn(result);
      setNotice(`GRN ${result.transactionNo} approved — stock updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve GRN");
    } finally {
      setApproving(false);
    }
  };

  const handleCancel = async () => {
    setCanceling(true);
    setError(null);
    try {
      const result = await api.cancelGrnw(grnId);
      setGrn(result);
      setNotice(`GRN ${result.transactionNo} canceled.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel GRN");
    } finally {
      setCanceling(false);
    }
  };

  const handleReport = () => {
    if (!grn) return;
    setReportHtml(
      buildGrnwReportHtml({
        grn,
        shopName,
        logoUrl,
        adminName,
        items: computed,
        totals,
        invoiceDiscount,
        invoiceVat,
        expiryAdjustmentAmount,
      })
    );
  };

  if (!grn) {
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
            <input readOnly value={grn.store?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Invoice No.*</label>
            <input
              value={invoiceNo}
              disabled={isLocked}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans. No</label>
            <input readOnly value={grn.transactionNo} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <input readOnly value={statusLabel(grn.status)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
            </div>
            <button onClick={onBack} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded shrink-0">
              LIST
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier*</label>
            <input readOnly value={grn.supplier?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              disabled={isLocked}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans. Date</label>
            <input readOnly value={grn.createdAt ? new Date(grn.createdAt).toLocaleString() : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input readOnly value={grn.approvedBy?.name || "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pay Type</label>
            <select value={paymentType} disabled={isLocked} onChange={(e) => setPaymentType(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              <option value="">Choose...</option>
              {PAYMENT_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User Name</label>
            <input readOnly value={grn.createdBy?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved Date</label>
            <input readOnly value={grn.approvedAt ? new Date(grn.approvedAt).toLocaleString() : "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Received By*</label>
            <select value={receivedById} disabled={isLocked} onChange={(e) => setReceivedById(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              <option value="">Select...</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mt-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trn. Ref. No</label>
            <input
              value={transactionRefNo}
              disabled={isLocked}
              onChange={(e) => setTransactionRefNo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div className="col-span-3" />
        </div>

        {(error || notice) && <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>{error || notice}</p>}

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
              getSublabel={(r) =>
                [r.itemCode, `PP ${fmt(r.ppPerPiece)}`, `MRP ${fmt(r.mrpPerPiece)}`].filter(Boolean).join(" · ")
              }
              placeholder="Search item..."
              disabled={isLocked}
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
              disabled={isLocked}
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
            disabled={!stagedRow || isLocked}
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
              disabled={isLocked}
              onChange={(e) => setStagedBonusQty(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
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
              disabled={isLocked}
              onChange={(e) => setStagedVat(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Discount</label>
            <input
              type="number"
              min={0}
              value={stagedDiscount}
              disabled={isLocked}
              onChange={(e) => setStagedDiscount(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Batch</label>
            <input
              value={stagedBatch}
              disabled={isLocked}
              onChange={(e) => setStagedBatch(e.target.value)}
              placeholder="Batch No*"
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Exp. Date</label>
            <input
              type="date"
              value={stagedExpiry}
              disabled={isLocked}
              onChange={(e) => setStagedExpiry(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
        </div>
      </div>

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
                  <input
                    type="number"
                    min={0}
                    disabled={isLocked}
                    value={it.packSize || ""}
                    onChange={(e) => setPackSize(it.productId, it.rcvQtyPieces, Number(e.target.value) || 0)}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    disabled={isLocked}
                    value={it.rcvQtyBox || ""}
                    onChange={(e) => setRcvQtyBox(it.productId, it.packSize, it.tradePrice, Number(e.target.value) || 0)}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    disabled={isLocked}
                    value={it.rcvQtyPieces || ""}
                    onChange={(e) => setRcvQtyPieces(it.productId, it.packSize, it.tradePrice, Number(e.target.value) || 0)}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    disabled={isLocked}
                    value={it.bonusQtyPieces || ""}
                    onChange={(e) => setItem(it.productId, { bonusQtyPieces: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-700 truncate">{it.totalQtyPieces}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.tradePrice)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    disabled={isLocked}
                    value={it.totalValue || ""}
                    onChange={(e) => setItem(it.productId, { totalValue: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    disabled={isLocked}
                    value={it.vatAmt || ""}
                    onChange={(e) => setItem(it.productId, { vatAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    disabled={isLocked}
                    value={it.discAmt || ""}
                    onChange={(e) => setItem(it.productId, { discAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-1.5 px-3 text-right font-bold text-slate-900 truncate">{fmt(it.unitPrice)}</td>
                <td className="py-1 px-2 truncate">
                  <input
                    type="number"
                    disabled={isLocked}
                    value={it.mrp || ""}
                    onChange={(e) => setItem(it.productId, { mrp: Number(e.target.value) || 0 })}
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-1.5 px-3 text-right text-slate-600 truncate">{fmt(it.gp)}</td>
                <td className="py-1.5 px-3 text-right text-slate-600 truncate">{it.gpPct.toFixed(2)}</td>
                <td className="py-1 px-2 truncate">
                  <input
                    value={it.batchNo}
                    disabled={isLocked}
                    onChange={(e) => setItem(it.productId, { batchNo: e.target.value })}
                    placeholder="Batch No*"
                    className={`w-24 border rounded px-1.5 py-1 disabled:bg-slate-100 ${
                      it.totalQtyPieces > 0 && !it.batchNo ? "border-red-400" : "border-slate-300"
                    }`}
                  />
                </td>
                <td className="py-1 px-2 truncate">
                  <input
                    type="date"
                    value={it.expiryDate}
                    disabled={isLocked}
                    onChange={(e) => setItem(it.productId, { expiryDate: e.target.value })}
                    className={`w-28 border rounded px-1.5 py-1 disabled:bg-slate-100 ${
                      it.totalQtyPieces > 0 && !it.expiryDate ? "border-red-400" : "border-slate-300"
                    }`}
                  />
                </td>
                <td className="py-1.5 px-3 text-right font-bold text-slate-900 truncate">{fmt(it.netTotal)}</td>
                <td className="py-1.5 px-3 text-center truncate">
                  {!isLocked && (
                    <button onClick={() => removeItem(it.productId)} className="text-red-500 hover:text-red-700" title="Remove">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={20} className="py-16 text-center text-slate-400 font-bold">
                  No items on this GRN yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[#f1f5f9] border-t border-slate-300 px-4 py-1.5 flex items-center justify-end text-xs font-semibold text-slate-600 shrink-0">
        <span>Total Item : </span>
        <span className="font-bold text-slate-900 ml-1">{computed.length}</span>
      </div>

      <div className="bg-white border-t border-slate-300 p-3 shrink-0 text-xs flex items-start gap-4">
        <div className="flex-1 space-y-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Remarks</label>
            <input value={remarks} disabled={isLocked} onChange={(e) => setRemarks(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100" />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="w-40">
              <label className="font-bold text-slate-700 block mb-1">Invoice Discount</label>
              <input
                type="number"
                value={invoiceDiscount || ""}
                disabled={isLocked}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setInvoiceDiscount(v);
                  applyCalculate(v, invoiceVat);
                }}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
              />
            </div>
            <div className="w-40">
              <label className="font-bold text-slate-700 block mb-1">Invoice VAT</label>
              <input
                type="number"
                value={invoiceVat || ""}
                disabled={isLocked}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setInvoiceVat(v);
                  applyCalculate(invoiceDiscount, v);
                }}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
              />
            </div>
            <div className="w-40">
              <label className="font-bold text-slate-700 block mb-1">Exp. Adjustment Amt</label>
              <input
                type="number"
                value={expiryAdjustmentAmount || ""}
                disabled={isLocked}
                onChange={(e) => setExpiryAdjustmentAmount(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={isLocked}
              className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold px-5 py-1.5 rounded"
            >
              CALCULATE
            </button>
          </div>
        </div>
        <div className="w-72 space-y-1.5 shrink-0">
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
            <span className="text-slate-500 font-bold">Total Amount</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalTradeValue)}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
            <span className="text-slate-500 font-bold">Total VAT</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalVat)}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
            <span className="text-slate-500 font-bold">Total Discount</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.totalDiscount)}</span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
            <span className="text-slate-500 font-bold">Avg.GP(%)</span>
            <span className="text-slate-900 font-bold">{fmt4(totals.avgGpPct)}</span>
          </div>
          <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5">
            <span className="text-emerald-700 font-bold">Net Amount</span>
            <span className="text-emerald-900 font-bold">{fmt4(totals.netAmount)}</span>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-1.5 shrink-0">
          <button
            onClick={handleApprove}
            disabled={isLocked || approving}
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
          <button onClick={onBack} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded">
            NEW
          </button>
          <button
            onClick={handleCancel}
            disabled={grn.status !== "UNAPPROVED" || canceling}
            className="bg-slate-500 hover:bg-slate-600 disabled:opacity-40 text-white font-bold py-2 px-6 rounded"
          >
            {canceling ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" variant="white" /> CANCELING...
              </span>
            ) : (
              "CANCEL"
            )}
          </button>
          <button onClick={handleReport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded">
            REPORT
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLocked || saving}
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
