"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Grn, PurchaseOrderOption, RequisitionItemRow } from "../../../types";
import { fmt, fmt4, round4 } from "../../../lib/format";
import { amountInWords } from "../../../lib/numberToWords";
import { ComboSelect as SearchableSelect, ComboOption } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { GrnItemDraft, PAYMENT_TYPES, statusLabel, toDateInput } from "./types";
import { splitProportionally } from "../../../lib/proportionalSplit";

// =======================================================
// DETAIL VIEW (edit items, submit / approve)
// =======================================================

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  adminName: string;
  grnId: number;
  onBack: () => void;
}> = ({ api, grnId, onBack }) => {
  const { shopName, logoUrl } = useShopSession();
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

  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);
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
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      .getGrnPurchaseOrders({ supplierId: grn.supplierId })
      .then(setOrders)
      .catch(() => setOrders([]));
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
      const gp = it.mrp - unitPrice;
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
    const storeAddr = [grn.store?.address, grn.store?.phone].filter(Boolean).join(" — ");
    const itemRows = computed
      .map(
        (it, idx) => `<tr>
          <td>${idx + 1}</td>
          <td>${it.itemCode || ""}</td>
          <td>${it.itemName}</td>
          <td>${it.batchNo || ""}</td>
          <td class="right">${it.rcvQtyBox}</td>
          <td class="right">${it.rcvQtyPieces}</td>
          <td class="right">${it.bonusQtyPieces}</td>
          <td class="right">${fmt(it.unitPrice)}</td>
          <td class="right">${fmt(it.totalValue)}</td>
          <td class="right">${fmt(it.vatAmt)}</td>
          <td class="right">${fmt(it.discAmt)}</td>
          <td class="right">${fmt(it.mrp)}</td>
          <td class="right">${it.gpPct.toFixed(2)}</td>
          <td class="right">${fmt(it.netTotal)}</td>
        </tr>`
      )
      .join("");
    setReportHtml(`
      <html><head><title>${grn.transactionNo}</title>
      <style>
        * { box-sizing: border-box; }
        body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111;font-size:12px}
        .header{display:flex;align-items:center;gap:14px;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:10px}
        .header img{height:52px}
        h1{font-size:19px;margin:0;letter-spacing:.02em}
        .doc-title{font-size:13px;font-weight:bold;color:#374151;margin-top:2px}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin-bottom:14px;font-size:12px}
        .meta .row{display:flex;justify-content:space-between;border-bottom:1px dotted #ddd;padding:3px 0}
        .meta .row span:first-child{color:#555;font-weight:bold}
        .meta .row span:last-child{font-weight:bold}
        .remarks{margin:8px 0 14px;font-size:12px;color:#374151}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #d1d5db;padding:6px 8px;font-size:11px;text-align:left}
        th{background:#f1f5f9;font-weight:bold;text-transform:uppercase;font-size:10px}
        .right{text-align:right}
        .center{text-align:center}
        tbody tr:nth-child(even){background:#fafafa}
        .totals-wrap{display:flex;justify-content:flex-end;margin-top:14px}
        .totals{width:280px;font-size:12px}
        .totals .row{display:flex;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #eee}
        .totals .row.net{border-top:2px solid #111;border-bottom:none;font-weight:bold;font-size:13px;margin-top:4px;padding-top:8px}
        .words{margin-top:10px;font-size:11.5px;font-style:italic;color:#374151}
        .sign{display:flex;justify-content:space-between;margin-top:70px;font-size:12px}
        .sign div{border-top:1px solid #333;padding-top:5px;width:28%;text-align:center;color:#374151}
      </style></head><body>
      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" />` : ""}
        <div>
          <h1>${shopName || ""}</h1>
          ${storeAddr ? `<div style="font-size:11px;color:#555">${storeAddr}</div>` : ""}
          <div class="doc-title">Goods Receipt Note (With PO)</div>
        </div>
      </div>
      <div class="meta">
        <div class="row"><span>GRN No.</span><span>${grn.transactionNo}</span></div>
        <div class="row"><span>Status</span><span>${statusLabel(grn.status)}</span></div>
        <div class="row"><span>Order No.</span><span>${grn.purchaseOrder?.orderNo || "—"}</span></div>
        <div class="row"><span>Invoice No.</span><span>${grn.invoiceNo}</span></div>
        <div class="row"><span>Invoice Date</span><span>${toDateInput(grn.invoiceDate)}</span></div>
        <div class="row"><span>Store</span><span>${grn.store?.name || ""}</span></div>
        <div class="row"><span>Supplier</span><span>${grn.supplier?.name || ""}</span></div>
        <div class="row"><span>Payment Mode</span><span>${grn.paymentType}</span></div>
        <div class="row"><span>Transaction Date</span><span>${new Date(grn.createdAt).toLocaleString()}</span></div>
        <div class="row"><span>Received By</span><span>${grn.receivedBy?.name || "—"}</span></div>
      </div>
      ${grn.remarks ? `<div class="remarks"><b>Remarks:</b> ${grn.remarks}</div>` : ""}
      <table><thead><tr>
        <th>Sl</th><th>Item No</th><th>Item Name</th><th>Batch</th>
        <th class="right">Box</th><th class="right">Pcs</th><th class="right">Bonus</th>
        <th class="right">Unit Price</th><th class="right">Total</th><th class="right">VAT</th>
        <th class="right">Disc.</th><th class="right">MRP</th><th class="right">GP%</th><th class="right">Net Total</th>
      </tr></thead><tbody>${itemRows}</tbody></table>
      <div class="totals-wrap">
        <div class="totals">
          <div class="row"><span>Total Amount</span><span>${fmt4(totals.totalTradeValue)}</span></div>
          <div class="row"><span>Total VAT</span><span>${fmt4(totals.totalVat)}</span></div>
          <div class="row"><span>Total Discount</span><span>${fmt4(totals.totalDiscount)}</span></div>
          <div class="row"><span>Invoice Discount</span><span>${fmt4(invoiceDiscount)}</span></div>
          <div class="row"><span>Invoice VAT</span><span>${fmt4(invoiceVat)}</span></div>
          <div class="row"><span>Exp. Adjustment</span><span>${fmt4(expiryAdjustmentAmount)}</span></div>
          <div class="row net"><span>Net Amount</span><span>${fmt4(totals.netAmount)}</span></div>
        </div>
      </div>
      <div class="words">In Words: ${amountInWords(totals.netAmount)}</div>
      <div class="sign">
        <div>${grn.receivedBy?.name || ""}<br/>Received By</div>
        <div>${grn.createdBy?.name || ""}<br/>Entry By</div>
        <div>${grn.approvedBy?.name || ""}<br/>Approved By</div>
      </div>
      </body></html>
    `);
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
                    disabled={isApproved}
                    value={it.rcvQtyBox || ""}
                    onChange={(e) => setItem(it.productId, { rcvQtyBox: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    disabled={isApproved}
                    value={it.rcvQtyPieces || ""}
                    onChange={(e) => setReceivedPieces(it, Number(e.target.value) || 0)}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    disabled={isApproved}
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
                    step="0.01"
                    disabled={isApproved}
                    value={it.totalValue || ""}
                    onChange={(e) => setTotalValue(it, Number(e.target.value) || 0)}
                    title="Total Value — editing this recalculates Unit Price as Total Value ÷ RcvQty (Pcs)"
                    className="w-20 border border-slate-300 rounded px-1.5 py-1 text-right font-bold disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    disabled={isApproved}
                    value={it.vatAmt || ""}
                    onChange={(e) => setItem(it.productId, { vatAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    disabled={isApproved}
                    value={it.discAmt || ""}
                    onChange={(e) => setItem(it.productId, { discAmt: Number(e.target.value) || 0 })}
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
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
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    disabled={isApproved}
                    value={it.mrp || ""}
                    onChange={(e) => setItem(it.productId, { mrp: Number(e.target.value) || 0 })}
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.gp)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.gpPct.toFixed(2)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    value={it.batchNo}
                    disabled={isApproved}
                    onChange={(e) => setItem(it.productId, { batchNo: e.target.value })}
                    placeholder="Batch No*"
                    className={`w-24 border rounded px-1.5 py-1 disabled:bg-slate-100 ${
                      it.totalQtyPieces > 0 && !it.batchNo ? "border-red-400" : "border-slate-300"
                    }`}
                  />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
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
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(it.netTotal)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
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
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-1.5 rounded">Choose File</button>
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
