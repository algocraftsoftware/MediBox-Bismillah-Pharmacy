"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Grn, PurchaseOrderOption, RequisitionItemRow } from "../../../types";
import { fmt, fmt4, round4 } from "../../../lib/format";
import { ComboSelect as SearchableSelect, ComboOption } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { GrnItemDraft, PAYMENT_TYPES, statusLabel, toDateInput, batchMissingFor } from "./types";
import { splitProportionally } from "../../../lib/proportionalSplit";
import { UnapproveButton } from "../UnapproveButton";
import { useAdmins } from "../../../hooks/useShopLookups";
import { GrnAttachment } from "../GrnAttachment";
import { buildGrnReportHtml } from "./report";

// =======================================================
// DETAIL VIEW (edit items, submit / approve)
// =======================================================

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  adminName: string;
  grnId: number;
  onBack: () => void;
}> = ({ api, grnId, onBack }) => {
  const { shopName, logoUrl, adminRole } = useShopSession();
  const batchMissing = (it: { totalQtyPieces: number; batchNo: string; departmentName?: string | null }) =>
    batchMissingFor(it, adminRole === "ADMIN");
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
  const [addProductId, setAddProductId] = useState("");
  const [supplierGrid, setSupplierGrid] = useState<RequisitionItemRow[]>([]);
  const [loadingSupplierGrid, setLoadingSupplierGrid] = useState(false);

  const admins = useAdmins(api);
  const [orders, setOrders] = useState<PurchaseOrderOption[]>([]);
  const [changingOrder, setChangingOrder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  const isApproved = grn?.status === "APPROVED";

  const loadGrn = useCallback(() => {
    setError(null);
    api
      .getGrn(grnId)
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
            departmentName: it.product.department?.name ?? null,
            uom: it.product.unit,
            packSize: it.product.boxQty,
            orderQtyPieces: it.orderQtyPieces,
            rcvQtyBox: it.rcvQtyBox,
            rcvQtyPieces: it.rcvQtyPieces,
            bonusQtyPieces: it.bonusQtyPieces,
            tradePrice: it.tradePrice,
            totalValue: it.totalValue,
            // Rebuild the per-piece price the line was saved with, so the Unit
            // Price box reopens showing what was actually invoiced rather than
            // the PO's price.
            unitPrice: it.rcvQtyPieces > 0 ? round4(it.totalValue / it.rcvQtyPieces) : it.tradePrice,
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
  }, [loadGrn]);

  useEffect(() => {
    if (!grn) return;
    setLoadingSupplierGrid(true);
    api
      .getRequisitionItems({ storeId: grn.storeId, supplierId: grn.supplierId, mode: undefined, days: 30, page: 1, pageSize: 3000 })
      .then((res) => setSupplierGrid(res.rows))
      .catch(() => setSupplierGrid([]))
      .finally(() => setLoadingSupplierGrid(false));
  }, [api, grn]);

  // Every other FINAL_APPROVED PO from the same supplier, so a receiver who
  // picked the wrong one of two POs (a common mix-up) can switch — changing
  // it re-seeds the item grid from the newly picked PO (see handleChangeOrder).
  useEffect(() => {
    if (!grn) return;
    api
      .getGrnPurchaseOrders({ supplierId: grn.supplierId, includeId: grn.purchaseOrder?.id })
      .then(setOrders)
      .catch(() => setOrders([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, grn?.supplierId]);

  const orderOptions: ComboOption[] = orders.map((o) => ({
    value: String(o.id),
    label: o.orderNo || `Order #${o.id}`,
    sublabel: `${o.finalApprovedAt ? new Date(o.finalApprovedAt).toLocaleDateString() : ""} — ${fmt(o.totalPPAmount)}`,
  }));

  const handleChangeOrder = async (newPurchaseOrderId: string) => {
    if (!grn || !newPurchaseOrderId || Number(newPurchaseOrderId) === grn.purchaseOrder?.id) return;
    setChangingOrder(true);
    setError(null);
    try {
      const result = await api.updateGrn(grnId, { purchaseOrderId: Number(newPurchaseOrderId) });
      setNotice(`Switched to Order ${result.purchaseOrder?.orderNo} — item grid reloaded from this PO.`);
      loadGrn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to switch Purchase Order");
    } finally {
      setChangingOrder(false);
    }
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

  const addOptions: ComboOption[] = supplierGrid
    .filter((r) => !items.some((it) => it.productId === r.productId))
    .map((r) => ({ value: String(r.productId), label: r.itemName, sublabel: r.itemCode || undefined }));

  const handleAddItem = () => {
    const row = supplierGrid.find((r) => String(r.productId) === addProductId);
    if (!row) return;
    setItems((prev) => [
      ...prev,
      {
        productId: row.productId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        genericName: row.genericName,
        displayCategory: null,
        uom: row.uom,
        packSize: row.packSize,
        orderQtyPieces: 0,
        rcvQtyBox: 0,
        rcvQtyPieces: 0,
        bonusQtyPieces: 0,
        tradePrice: row.ppPerPiece,
        // Starts at the catalog price per piece; nothing received yet, so the
        // line's total value is still zero.
        totalValue: 0,
        unitPrice: row.ppPerPiece,
        vatAmt: 0,
        discAmt: 0,
        mrp: row.mrpPerPiece,
        batchNo: "",
        expiryDate: "",
      },
    ]);
    setAddProductId("");
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
      // Gross profit is measured against what the line actually costs, which is
      // the total after VAT is added and discount taken off — not the Unit
      // Price box, which is only ever Total Value / received qty. Deriving GP
      // from that box meant typing a VAT or discount moved the money columns
      // but left GP and GP% untouched, and it also disagreed with the server:
      // computeItem() prices the line at netTotal / received qty and stores
      // that as the batch's purchase price on approval.
      const netUnitPrice = it.rcvQtyPieces > 0 ? netTotal / it.rcvQtyPieces : unitPrice;
      const gp = it.mrp - netUnitPrice;
      const gpPct = it.mrp > 0 ? (gp / it.mrp) * 100 : 0;
      return { ...it, totalQtyPieces, totalValue, netTotal, unitPrice, gp, gpPct };
    });
  }, [items]);

  const totals = useMemo(() => {
    const totalTradeValue = computed.reduce((a, i) => a + i.totalValue, 0);
    const totalVat = computed.reduce((a, i) => a + i.vatAmt, 0);
    const totalDiscount = computed.reduce((a, i) => a + i.discAmt, 0);
    // invoiceDiscount/invoiceVat feed CALCULATE, which spreads them into
    // each item's own vatAmt/discAmt — netTotal per item already reflects
    // that, so it's not subtracted again here (only Expiry Adjustment is a
    // standalone, undistributed deduction).
    const netAmount = computed.reduce((a, i) => a + i.netTotal, 0) - expiryAdjustmentAmount;
    const avgGpPct = computed.length ? computed.reduce((a, i) => a + i.gpPct, 0) / computed.length : 0;
    return { totalTradeValue, totalVat, totalDiscount, netAmount, avgGpPct };
  }, [computed, expiryAdjustmentAmount]);

  // Spreads the Invoice Discount / Invoice VAT boxes across every item's own
  // Discount/VAT cell, proportional to each item's Total Value. Called
  // directly from those two inputs' onChange (with the just-typed value, not
  // the not-yet-committed state) so it applies live as you type — not just
  // when CALCULATE is clicked — while CALCULATE stays as an explicit
  // re-apply (e.g. after quantities change).
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

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await api.updateGrn(grnId, {
        invoiceNo,
        invoiceDate,
        paymentType,
        transactionRefNo: transactionRefNo || undefined,
        receivedById: receivedById ? Number(receivedById) : null,
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
      setGrn(result);
      setNotice("GRN saved.");
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
      const result = await api.approveGrn(grnId);
      setGrn(result);
      setNotice(`GRN ${result.transactionNo} approved — stock updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve GRN");
    } finally {
      setApproving(false);
    }
  };

  const handleReport = () => {
    if (!grn) return;
    setReportHtml(
      buildGrnReportHtml({
        grn,
        shopName,
        logoUrl,
        items: computed,
        totals,
        invoiceDiscount,
        invoiceVat,
        expiryAdjustmentAmount,
      }),
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
              disabled={isApproved}
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
              disabled={isApproved}
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
            <label className="font-bold text-slate-700 block mb-1">Order No*</label>
            <SearchableSelect
              options={orderOptions}
              value={grn.purchaseOrder ? String(grn.purchaseOrder.id) : ""}
              onChange={handleChangeOrder}
              disabled={isApproved || changingOrder}
              placeholder={changingOrder ? "Switching..." : "Select..."}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pay Type</label>
            <select value={paymentType} disabled={isApproved} onChange={(e) => setPaymentType(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
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
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mt-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Received By</label>
            <select value={receivedById} disabled={isApproved} onChange={(e) => setReceivedById(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              <option value="">Select...</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trn. Ref. No</label>
            <input
              value={transactionRefNo}
              disabled={isApproved}
              onChange={(e) => setTransactionRefNo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div className="col-span-2" />
        </div>

        {(error || notice) && <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>{error || notice}</p>}

        <div className="flex items-end gap-2 mt-2.5">
          <div className="flex-1">
            <label className="font-bold text-slate-700 block mb-1">Add Item</label>
            <SearchableSelect
              options={addOptions}
              value={addProductId}
              onChange={setAddProductId}
              disabled={isApproved}
              placeholder={loadingSupplierGrid ? "Loading items..." : "Select..."}
            />
          </div>
          <button
            onClick={handleAddItem}
            disabled={!addProductId || isApproved}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold px-4 py-1.5 rounded"
          >
            + ADD
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[3%] whitespace-nowrap">Sl</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Item No</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] whitespace-nowrap">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] whitespace-nowrap">Display Category</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">Ord Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">RcvQty (Box)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">RcvQty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] whitespace-nowrap">Bonus Qty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">Total Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] whitespace-nowrap">Prev. Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] whitespace-nowrap">Total Value</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] whitespace-nowrap">VAT</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] whitespace-nowrap">Discount</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] whitespace-nowrap">Unit Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] whitespace-nowrap">MRP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] whitespace-nowrap">GP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] whitespace-nowrap">GP(%)</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Batch</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] whitespace-nowrap">Exp. Date</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] whitespace-nowrap">Net Total</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[3%] whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {computed.map((it, idx) => (
              <tr key={it.productId} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                <td className="py-4 px-3 border border-slate-200 text-slate-500 whitespace-nowrap">{idx + 1}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{it.itemCode}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 whitespace-nowrap">{it.itemName}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 whitespace-nowrap">{it.displayCategory}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 whitespace-nowrap">{it.packSize}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 whitespace-nowrap">{it.orderQtyPieces}</td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    min={0}
                    disabled={isApproved}
                    value={it.rcvQtyBox || ""}
                    onChange={(e) => setItem(it.productId, { rcvQtyBox: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    min={0}
                    disabled={isApproved}
                    value={it.rcvQtyPieces || ""}
                    onChange={(e) => setReceivedPieces(it, Number(e.target.value) || 0)}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    min={0}
                    disabled={isApproved}
                    value={it.bonusQtyPieces || ""}
                    onChange={(e) => setItem(it.productId, { bonusQtyPieces: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-700 whitespace-nowrap">{it.totalQtyPieces}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 whitespace-nowrap">{fmt(it.tradePrice)}</td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isApproved}
                    value={it.totalValue || ""}
                    onChange={(e) => setTotalValue(it, Number(e.target.value) || 0)}
                    title="Total Value — editing this recalculates Unit Price as Total Value ÷ RcvQty (Pcs)"
                    className="w-20 border border-slate-300 rounded px-1.5 py-1 text-right font-bold disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    disabled={isApproved}
                    value={it.vatAmt || ""}
                    onChange={(e) => setItem(it.productId, { vatAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    disabled={isApproved}
                    value={it.discAmt || ""}
                    onChange={(e) => setItem(it.productId, { discAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isApproved}
                    value={it.unitPrice || ""}
                    onChange={(e) => setUnitPrice(it, Number(e.target.value) || 0)}
                    title="Unit Price — editing this recalculates Total Value as Unit Price × RcvQty (Pcs)"
                    className="w-20 border border-slate-300 rounded px-1.5 py-1 text-right font-bold disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="number"
                    disabled={isApproved}
                    value={it.mrp || ""}
                    onChange={(e) => setItem(it.productId, { mrp: Number(e.target.value) || 0 })}
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 whitespace-nowrap">{fmt(it.gp)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 whitespace-nowrap">{it.gpPct.toFixed(2)}</td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    value={it.batchNo}
                    disabled={isApproved}
                    onChange={(e) => setItem(it.productId, { batchNo: e.target.value })}
                    placeholder="Batch No*"
                    className={`w-24 border rounded px-1.5 py-1 disabled:bg-slate-100 ${
                      batchMissing(it) ? "border-red-400" : "border-slate-300"
                    }`}
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                  <input
                    type="date"
                    value={it.expiryDate}
                    disabled={isApproved}
                    onChange={(e) => setItem(it.productId, { expiryDate: e.target.value })}
                    className={`w-28 border rounded px-1.5 py-1 disabled:bg-slate-100 ${
                      it.totalQtyPieces > 0 && !it.expiryDate ? "border-red-400" : "border-slate-300"
                    }`}
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 whitespace-nowrap">{fmt(it.netTotal)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center whitespace-nowrap">
                  {!isApproved && (
                    <button onClick={() => removeItem(it.productId)} className="text-red-500 hover:text-red-700" title="Remove">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={21} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
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
            <input value={remarks} disabled={isApproved} onChange={(e) => setRemarks(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100" />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="w-40">
              <label className="font-bold text-slate-700 block mb-1">Invoice Discount</label>
              <input
                type="number"
                value={invoiceDiscount || ""}
                disabled={isApproved}
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
                disabled={isApproved}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setInvoiceVat(v);
                  applyCalculate(invoiceDiscount, v);
                }}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={isApproved}
              className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold px-5 py-1.5 rounded"
            >
              CALCULATE
            </button>
            <GrnAttachment
              attachmentUrl={grn.attachmentUrl}
              disabled={isApproved}
              onUpload={(file) => api.uploadGrnAttachment(grnId, file)}
              onUploaded={(result) => {
                setGrn(result as typeof grn);
                setNotice("Purchase invoice attached.");
              }}
              onError={(msg) => setError(msg || null)}
            />
            <div className="w-40">
              <label className="font-bold text-slate-700 block mb-1">Exp. Adjustment Amt</label>
              <input
                type="number"
                value={expiryAdjustmentAmount || ""}
                disabled={isApproved}
                onChange={(e) => setExpiryAdjustmentAmount(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
              />
            </div>
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
            disabled={isApproved || approving}
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
          <UnapproveButton
            status={grn.status}
            label={`GRN ${grn.transactionNo}`}
            movesStock
            onUnapprove={() => api.unapproveGrn(grn.id)}
            onDone={(result) => {
              setGrn(result as typeof grn);
              setNotice("Un-approved — this document is editable again.");
            }}
            onError={(msg) => setError(msg || null)}
          />
          <button onClick={loadGrn} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded">
            NEW
          </button>
          <button onClick={handleReport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded">
            REPORT
          </button>
          <button
            onClick={handleSubmit}
            disabled={isApproved || saving}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold py-2 px-6 rounded"
          >
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" /> SAVING...
              </span>
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
