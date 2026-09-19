"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { AdjWithPo, PurchaseOrderOption, RequisitionItemRow, RtvAdjustOption, RtvVia, Supplier } from "../../../types";
import { ItemEntryTypeahead } from "../ItemEntryTypeahead";
import { amountInWords } from "../../../lib/numberToWords";
import { splitProportionally } from "../../../lib/proportionalSplit";
import { fmt, fmt4 } from "../../../lib/format";
import { ComboSelect as SearchableSelect, ComboOption } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { AdjItemDraft, PAYMENT_TYPES, RtvLineDraft, statusLabel, toDateInput, VIA_OPTIONS, viaLabel } from "./types";

// =======================================================
// DETAIL VIEW — single create/edit screen
// =======================================================

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  adjId: number | null;
  onBack: () => void;
  onCreated: (id: number) => void;
  onNew: () => void;
}> = ({ api, stores, adjId, onBack, onCreated, onNew }) => {
  const { shopName, logoUrl } = useShopSession();
  const [adj, setAdj] = useState<AdjWithPo | null>(null);
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState("");
  const [receivedById, setReceivedById] = useState("");
  const [via, setVia] = useState<RtvVia>("WAREHOUSE");
  const [remarks, setRemarks] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);

  const [items, setItems] = useState<AdjItemDraft[]>([]);
  const [rtvLines, setRtvLines] = useState<RtvLineDraft[]>([]);
  const [rtvPickId, setRtvPickId] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [stagedRow, setStagedRow] = useState<RequisitionItemRow | null>(null);
  const [stagedQty, setStagedQty] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);
  const [poOptions, setPoOptions] = useState<PurchaseOrderOption[]>([]);
  const [rtvOptions, setRtvOptions] = useState<RtvAdjustOption[]>([]);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(adjId !== null);

  const isLocked = adj?.status === "APPROVED";
  const isPoPicked = !!purchaseOrderId;

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (adjId === null) return;
    setLoading(true);
    api
      .getAdjWithPo(adjId)
      .then((g) => {
        setAdj(g);
        setStoreId(String(g.storeId));
        setSupplierId(String(g.supplierId));
        setPurchaseOrderId(g.purchaseOrderId ? String(g.purchaseOrderId) : "");
        setInvoiceNo(g.invoiceNo);
        setInvoiceDate(toDateInput(g.invoiceDate));
        setPaymentType(g.paymentType);
        setReceivedById(g.receivedById ? String(g.receivedById) : "");
        setVia(g.via || "WAREHOUSE");
        setRemarks(g.remarks || "");
        setInvoiceDiscount(g.invoiceDiscount);
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
            vatAmt: it.vatAmt,
            discAmt: it.discAmt,
            mrp: it.mrp,
            batchNo: it.batchNo || "",
            expiryDate: toDateInput(it.expiryDate),
          }))
        );
        setRtvLines(
          (g.rtvAdjustments || []).map((r) => ({
            rtvId: r.rtvId,
            rtvNo: r.rtv.rtvNo,
            rtvDate: "",
            storeName: "",
            rtvAmount: r.rtv.totalAmount,
            availableBalance: r.rtv.totalAmount,
            adjustmentAmount: String(r.adjustmentAmount),
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load adjustment"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjId]);

  // Fetched for existing (unapproved) adjustments too, not just new ones —
  // so the PO No field can be switched to a different PO from the same
  // supplier after the fact (e.g. the wrong one of two was picked initially).
  useEffect(() => {
    if (!storeId || !supplierId) return;
    api.getAdjWithPoPurchaseOrders({ storeId, supplierId }).then(setPoOptions).catch(() => setPoOptions([]));
  }, [api, storeId, supplierId]);

  // Supplier alone is enough to look up their adjustable RTVs — Store isn't
  // part of an RTV's credit (it's owed by the supplier shop-wide), so it
  // isn't required before the list can populate.
  useEffect(() => {
    if (!supplierId || adj) return;
    api.getAdjWithPoRtvOptions({ storeId: storeId || undefined, supplierId }).then(setRtvOptions).catch(() => setRtvOptions([]));
  }, [api, storeId, supplierId, adj]);

  const handlePickPo = (poId: string) => {
    setPurchaseOrderId(poId);
    if (!poId || !storeId) {
      setItems([]);
      return;
    }
    api
      .getAdjWithPoOrderItems(Number(poId), Number(storeId))
      .then((rows: any[]) => {
        setItems(
          rows.map((it) => ({
            productId: it.productId,
            itemCode: null,
            itemName: "",
            genericName: null,
            displayCategory: it.displayCategorySnapshot,
            uom: "Pcs",
            packSize: 1,
            orderQtyPieces: it.orderQtyPieces,
            rcvQtyBox: it.rcvQtyBox,
            rcvQtyPieces: it.rcvQtyPieces,
            bonusQtyPieces: it.bonusQtyPieces,
            tradePrice: it.tradePrice,
            vatAmt: it.vatAmt,
            discAmt: it.discAmt,
            mrp: it.mrp,
            batchNo: it.batchNo || "",
            expiryDate: it.expiryDate ? String(it.expiryDate).split("T")[0] : "",
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load PO items"));
  };

  // The PO-items endpoint doesn't include product name/code/pack — patch
  // those in from the product catalog once loaded via the item search index.
  useEffect(() => {
    if (items.length === 0 || items.every((it) => it.itemName)) return;
    const missingIds = items.filter((it) => !it.itemName).map((it) => it.productId);
    if (missingIds.length === 0 || !storeId || !supplierId) return;
    api
      .getRequisitionItems({ storeId, supplierId, days: 30, page: 1, pageSize: 3000 })
      .then((res) => {
        const byId = new Map(res.rows.map((r) => [r.productId, r]));
        setItems((prev) =>
          prev.map((it) => {
            const row = byId.get(it.productId);
            if (!row || it.itemName) return it;
            return { ...it, itemCode: row.itemCode, itemName: row.itemName, genericName: row.genericName, uom: row.uom, packSize: row.packSize };
          })
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, storeId, supplierId]);

  const setItem = (productId: number, patch: Partial<AdjItemDraft>) => {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));
  };
  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const fetchItemResults = useCallback(
    async (q: string) => {
      if (!storeId || !supplierId) return [];
      const res = await api.getRequisitionItems({ storeId, supplierId, search: q, page: 1, pageSize: 20 });
      return res.rows.filter((r) => !items.some((it) => it.productId === r.productId));
    },
    [api, storeId, supplierId, items]
  );

  const handleSelectItem = (row: RequisitionItemRow) => {
    setStagedRow(row);
    setSearchQuery(row.itemName);
    setStagedQty("");
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
        orderQtyPieces: 0,
        rcvQtyBox: 0,
        rcvQtyPieces: qty,
        bonusQtyPieces: 0,
        tradePrice: stagedRow.ppPerPiece,
        vatAmt: 0,
        discAmt: 0,
        mrp: stagedRow.mrpPerPiece,
        batchNo: "",
        expiryDate: "",
      },
    ]);
    setStagedRow(null);
    setSearchQuery("");
    setStagedQty("");
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handlePickRtv = (id: string) => {
    setRtvPickId("");
    const opt = rtvOptions.find((o) => String(o.id) === id);
    if (!opt || rtvLines.some((l) => l.rtvId === opt.id)) return;
    setRtvLines((prev) => [
      ...prev,
      {
        rtvId: opt.id,
        rtvNo: opt.rtvNo,
        rtvDate: new Date(opt.createdAt).toLocaleDateString(),
        storeName: opt.store.name,
        rtvAmount: opt.totalAmount,
        availableBalance: opt.remainingBalance,
        adjustmentAmount: String(opt.remainingBalance),
      },
    ]);
  };
  const setRtvLineAmt = (rtvId: number, val: string) => {
    setRtvLines((prev) => prev.map((l) => (l.rtvId === rtvId ? { ...l, adjustmentAmount: val } : l)));
  };
  const removeRtvLine = (rtvId: number) => {
    setRtvLines((prev) => prev.filter((l) => l.rtvId !== rtvId));
  };

  const computed = useMemo(
    () =>
      items.map((it) => {
        // RcvQty (Box) is an informational "received as N boxes" note, not an
        // additive amount on top of RcvQty (Pcs) — Pcs alone is the actual
        // received quantity (mirrors the backend's own computeItem(), and how
        // stock is incremented on approval).
        const totalQtyPieces = it.rcvQtyPieces + it.bonusQtyPieces;
        const totalValue = it.tradePrice * totalQtyPieces;
        const netTotal = totalValue + it.vatAmt - it.discAmt;
        const unitPrice = totalQtyPieces > 0 ? netTotal / totalQtyPieces : it.tradePrice;
        const gp = it.mrp - unitPrice;
        const gpPct = it.mrp > 0 ? (gp / it.mrp) * 100 : 0;
        return { ...it, totalQtyPieces, totalValue, netTotal, unitPrice, gp, gpPct };
      }),
    [items]
  );

  const totals = useMemo(() => {
    const totalTradeValue = computed.reduce((a, i) => a + i.totalValue, 0);
    const totalVat = computed.reduce((a, i) => a + i.vatAmt, 0);
    // Total Discount is purely the sum of each item's own Discount cell —
    // CALCULATE is what spreads the bottom Discount box down into those
    // cells (proportional to each item's Total Value), so this box and the
    // per-item GP/GP% both reflect it without double-subtracting it again
    // separately here.
    const totalDiscount = computed.reduce((a, i) => a + i.discAmt, 0);
    const totalMrpValue = computed.reduce((a, i) => a + i.mrp * i.totalQtyPieces, 0);
    const avgGpPct = computed.length ? computed.reduce((a, i) => a + i.gpPct, 0) / computed.length : 0;
    const rtvAdjustmentValue = rtvLines.reduce((a, l) => a + Math.max(0, Math.min(l.availableBalance, Number(l.adjustmentAmount) || 0)), 0);
    const netPayable = totalTradeValue + totalVat - totalDiscount - rtvAdjustmentValue;
    return { totalTradeValue, totalVat, totalDiscount, totalMrpValue, avgGpPct, rtvAdjustmentValue, netPayable };
  }, [computed, rtvLines]);

  // Spreads the invoice-level Discount box across every item's own Discount
  // cell, proportional to each item's Total Value — the last item absorbs
  // any rounding remainder so the per-item cells always sum back to exactly
  // the typed amount (keeps Total Discount, GP and GP% all consistent).
  // Called directly from the Discount input's onChange (with the just-typed
  // value) so it applies live as you type, not only when CALCULATE is
  // clicked — CALCULATE stays as an explicit re-apply.
  const applyCalculate = (discount: number) => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      const weights = prev.map((it) => it.tradePrice * (it.rcvQtyPieces + it.bonusQtyPieces));
      const discAmts = splitProportionally(discount, weights);
      return prev.map((it, idx) => ({ ...it, discAmt: discAmts[idx] }));
    });
  };
  const handleCalculate = () => applyCalculate(invoiceDiscount);

  const canSubmit = storeId && supplierId && purchaseOrderId && invoiceNo && invoiceDate && paymentType && receivedById && !isLocked;

  const buildPayload = () => ({
    storeId: Number(storeId),
    supplierId: Number(supplierId),
    purchaseOrderId: Number(purchaseOrderId),
    invoiceNo,
    invoiceDate,
    paymentType,
    receivedById: Number(receivedById),
    via,
    remarks: remarks || undefined,
    invoiceDiscount,
    items: items.map((it) => ({
      productId: it.productId,
      rcvQtyBox: it.rcvQtyBox,
      rcvQtyPieces: it.rcvQtyPieces,
      bonusQtyBox: 0,
      bonusQtyPieces: it.bonusQtyPieces,
      vatAmt: it.vatAmt,
      discAmt: it.discAmt,
      mrp: it.mrp,
      batchNo: it.batchNo || undefined,
      expiryDate: it.expiryDate || undefined,
    })),
    rtvAdjustments: rtvLines.map((l) => ({ rtvId: l.rtvId, adjustmentAmount: Math.max(0, Math.min(l.availableBalance, Number(l.adjustmentAmount) || 0)) })),
  });

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      if (adj) {
        const result = await api.updateAdjWithPo(adj.id, buildPayload());
        setAdj(result);
        setNotice("Adjustment saved.");
      } else {
        const result = await api.createAdjWithPo(buildPayload());
        setAdj(result);
        onCreated(result.id);
        setNotice(`Adjustment ${result.transactionNo} created.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save adjustment");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!adj) return;
    setApproving(true);
    setError(null);
    try {
      const result = await api.approveAdjWithPo(adj.id);
      setAdj(result);
      setNotice(`Adjustment ${result.transactionNo} approved — stock updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve adjustment");
    } finally {
      setApproving(false);
    }
  };

  const handleReport = () => {
    const storeName = adj?.store?.name || stores.find((s) => String(s.id) === storeId)?.name || "";
    const supplierName = adj?.supplier?.name || suppliers.find((s) => String(s.id) === supplierId)?.name || "";
    const itemRows = computed
      .map(
        (it, idx) => `<tr>
          <td>${idx + 1}</td><td>${it.itemCode || ""}</td><td>${it.itemName}</td>
          <td class="right">${it.totalQtyPieces}</td><td>${it.batchNo}</td><td>${it.expiryDate}</td>
          <td class="right">${fmt(it.tradePrice)}</td><td class="right">${fmt(it.totalValue)}</td>
          <td class="right">${fmt(it.mrp)}</td><td class="right">${fmt(it.netTotal)}</td>
        </tr>`
      )
      .join("");
    const rtvRows = rtvLines
      .map((l, idx) => `<tr><td>${idx + 1}</td><td>${l.rtvNo}</td><td class="right">${fmt(l.rtvAmount)}</td><td class="right">${fmt(Number(l.adjustmentAmount) || 0)}</td></tr>`)
      .join("");
    setReportHtml(`
      <html><head><title>${adj?.transactionNo || "ADJ"}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        .header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .header img{height:48px}
        h1{font-size:16px;margin:0}
        .meta p{margin:2px 0;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:14px}
        th,td{border:1px solid #ccc;padding:5px 7px;font-size:11px;text-align:left}
        th{background:#f1f5f9} .right{text-align:right}
        .words{margin-top:8px;font-size:12px}
        .sign{display:flex;justify-content:space-between;margin-top:60px;font-size:12px}
        .sign div{border-top:1px solid #333;padding-top:4px;width:30%;text-align:center}
      </style></head><body>
      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" />` : ""}
        <div><h1>${shopName || ""}</h1><div style="font-size:12px;font-weight:bold">Adjust With PO Report</div></div>
      </div>
      <div class="meta">
        <p><b>ADJ Store:</b> ${storeName} &nbsp; <b>RTV VIA:</b> ${viaLabel(via)} &nbsp; <b>GRN No:</b> ${adj?.transactionNo || ""} &nbsp; <b>Invoice No:</b> ${invoiceNo}</p>
        <p><b>Supplier:</b> ${supplierName} &nbsp; <b>Status:</b> ${adj ? statusLabel(adj.status) : "Unapproved"}</p>
        ${remarks ? `<p><b>Remarks:</b> ${remarks}</p>` : ""}
      </div>
      <table><thead><tr><th>SL</th><th>Item No</th><th>Item Name</th><th class="right">Qty</th><th>Batch</th><th>Exp.Date</th><th class="right">Unit Price</th><th class="right">Total Value</th><th class="right">MRP</th><th class="right">Net Total</th></tr></thead>
      <tbody>${itemRows}</tbody></table>
      <table><thead><tr><th>SL</th><th>RTV No</th><th class="right">RTV Amount</th><th class="right">Adjustment Amt</th></tr></thead><tbody>${rtvRows}</tbody></table>
      <p style="margin-top:10px;text-align:right"><b>Net Payable: ${fmt4(totals.netPayable)}</b></p>
      <div class="words">In Words: ${amountInWords(totals.netPayable)}</div>
      <div class="sign"><div>Received By</div><div>Entry By</div><div>Approved By</div></div>
      </body></html>
    `);
  };

  if (loading) {
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

  const poCombo: ComboOption[] = poOptions.map((o) => ({
    value: String(o.id),
    label: o.orderNo || `Order #${o.id}`,
    sublabel: `${o.finalApprovedAt ? new Date(o.finalApprovedAt).toLocaleDateString() : ""} — ${fmt(o.totalPPAmount)}`,
  }));
  const rtvCombo: ComboOption[] = rtvOptions
    .filter((o) => !rtvLines.some((l) => l.rtvId === o.id))
    .map((o) => ({
      value: String(o.id),
      label: o.rtvNo,
      sublabel: `${o.store.name} · ${new Date(o.createdAt).toLocaleDateString()} · Pending ${fmt(o.remainingBalance)}`,
    }));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs">
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">ADJ.Store Name*</label>
            <select
              value={storeId}
              disabled={isLocked || isPoPicked}
              onChange={(e) => setStoreId(e.target.value)}
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
            <label className="font-bold text-slate-700 block mb-1">Invoice No.*</label>
            <input value={invoiceNo} disabled={isLocked} onChange={(e) => setInvoiceNo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans. No</label>
            <input readOnly value={adj?.transactionNo || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <input readOnly value={adj ? statusLabel(adj.status) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
            </div>
            <button onClick={onBack} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded shrink-0">
              LIST
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier*</label>
            <SearchableSelect
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
              value={supplierId}
              onChange={setSupplierId}
              disabled={isLocked || isPoPicked || !storeId}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Invoice Date</label>
            <input type="date" value={invoiceDate} disabled={isLocked} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans. Date</label>
            <input readOnly value={adj ? new Date(adj.createdAt).toLocaleString() : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input readOnly value={adj?.approvedBy?.name || "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">PO No*</label>
            <SearchableSelect
              options={poCombo}
              value={purchaseOrderId}
              onChange={handlePickPo}
              disabled={isLocked || !storeId || !supplierId}
              placeholder={!storeId || !supplierId ? "Select Store & Supplier first" : "Select..."}
            />
          </div>
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
            <input readOnly value={adj?.createdBy?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved Date</label>
            <input readOnly value={adj?.approvedAt ? new Date(adj.approvedAt).toLocaleString() : "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Received by*</label>
            <select value={receivedById} disabled={isLocked} onChange={(e) => setReceivedById(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              <option value="">Select...</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">RTV VIA*</label>
            <select value={via} disabled={isLocked} onChange={(e) => setVia(e.target.value as RtvVia)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              {VIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2" />
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
              getSublabel={(r) => r.itemCode || undefined}
              placeholder={!storeId || !supplierId ? "Select Store & Supplier first" : "Search item..."}
              disabled={isLocked || !storeId || !supplierId}
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
              disabled={isLocked || !stagedRow}
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
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[3%] truncate">Sl</th>
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Item No</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Display Category</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Ord Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">RcvQty (Box)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">RcvQty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Bonus Qty (Pcs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Total Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Prev. Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Total Value</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">VAT</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Discount</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Unit Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">MRP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[3%] truncate">GP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">GP(%)</th>
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Batch</th>
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
                  <input type="number" min={0} disabled={isLocked} value={it.rcvQtyBox || ""} onChange={(e) => setItem(it.productId, { rcvQtyBox: Math.max(0, Number(e.target.value) || 0) })} className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input type="number" min={0} disabled={isLocked} value={it.rcvQtyPieces || ""} onChange={(e) => setItem(it.productId, { rcvQtyPieces: Math.max(0, Number(e.target.value) || 0) })} className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input type="number" min={0} disabled={isLocked} value={it.bonusQtyPieces || ""} onChange={(e) => setItem(it.productId, { bonusQtyPieces: Math.max(0, Number(e.target.value) || 0) })} className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-700 truncate">{it.totalQtyPieces}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.tradePrice)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.totalValue)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input type="number" disabled={isLocked} value={it.vatAmt || ""} onChange={(e) => setItem(it.productId, { vatAmt: Number(e.target.value) || 0 })} className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input type="number" disabled={isLocked} value={it.discAmt || ""} onChange={(e) => setItem(it.productId, { discAmt: Number(e.target.value) || 0 })} className="w-14 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(it.unitPrice)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input type="number" disabled={isLocked} value={it.mrp || ""} onChange={(e) => setItem(it.productId, { mrp: Number(e.target.value) || 0 })} className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.gp)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.gpPct.toFixed(2)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input value={it.batchNo} disabled={isLocked} onChange={(e) => setItem(it.productId, { batchNo: e.target.value })} placeholder="Batch No*" className={`w-24 border rounded px-1.5 py-1 disabled:bg-slate-100 ${it.totalQtyPieces > 0 && !it.batchNo ? "border-red-400" : "border-slate-300"}`} />
                </td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input type="date" value={it.expiryDate} disabled={isLocked} onChange={(e) => setItem(it.productId, { expiryDate: e.target.value })} className={`w-28 border rounded px-1.5 py-1 disabled:bg-slate-100 ${it.totalQtyPieces > 0 && !it.expiryDate ? "border-red-400" : "border-slate-300"}`} />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(it.netTotal)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
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
                <td colSpan={21} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {isPoPicked ? "No items on this PO." : "Select a PO No above to load its items."}
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

      <div className="bg-white border-t border-slate-300 p-3 shrink-0 text-xs">
        <div className="flex items-end gap-2 mb-2.5">
          <div className="flex-1">
            <label className="font-bold text-slate-700 block mb-1">RTV No</label>
            <SearchableSelect options={rtvCombo} value={rtvPickId} onChange={handlePickRtv} disabled={isLocked || !supplierId} placeholder={!supplierId ? "Select Supplier first" : "Select..."} />
          </div>
        </div>
        {rtvLines.length > 0 && (
          <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300 mb-2.5">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase">
                <th className="py-4 px-2 border border-slate-300 w-[6%] truncate">SL</th>
                <th className="py-4 px-2 border border-slate-300 w-[17%] truncate">RTV No</th>
                <th className="py-4 px-2 border border-slate-300 w-[16%] truncate">RTV Date</th>
                <th className="py-4 px-2 border border-slate-300 w-[24%] truncate">Store Name</th>
                <th className="py-4 px-2 border border-slate-300 text-right w-[15%] truncate">RTV Amt</th>
                <th className="py-4 px-2 border border-slate-300 text-right w-[14%] truncate">Adj Amt</th>
                <th className="py-4 px-2 border border-slate-300 text-center w-[8%] truncate"></th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap">
              {rtvLines.map((l, idx) => (
                <tr key={l.rtvId} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                  <td className="py-4 px-2 border border-slate-200 truncate">{idx + 1}</td>
                  <td className="py-4 px-2 border border-slate-200 font-bold text-slate-900 truncate">{l.rtvNo}</td>
                  <td className="py-4 px-2 border border-slate-200 text-slate-600 truncate">{l.rtvDate}</td>
                  <td className="py-4 px-2 border border-slate-200 text-slate-600 truncate">{l.storeName}</td>
                  <td className="py-4 px-2 border border-slate-200 text-right truncate">{fmt(l.rtvAmount)}</td>
                  <td className="py-2 px-1 border border-slate-200 truncate">
                    <input type="number" min={0} max={l.availableBalance} disabled={isLocked} value={l.adjustmentAmount} onChange={(e) => setRtvLineAmt(l.rtvId, e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                  </td>
                  <td className="py-4 px-2 border border-slate-200 text-center truncate">
                    {!isLocked && (
                      <button onClick={() => removeRtvLine(l.rtvId)} className="text-red-500 hover:text-red-700" title="Remove">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-slate-500 font-semibold mb-2.5">Total Record : {rtvLines.length}</p>

        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-end gap-2.5">
              <div className="w-40">
                <label className="font-bold text-slate-700 block mb-1">Discount</label>
                <input
                  type="number"
                  value={invoiceDiscount || ""}
                  disabled={isLocked}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setInvoiceDiscount(v);
                    applyCalculate(v);
                  }}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
                />
              </div>
              <div className="w-40">
                <label className="font-bold text-slate-700 block mb-1">Avg.GP(%)</label>
                <input readOnly value={fmt4(totals.avgGpPct)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
              </div>
              <button
                type="button"
                onClick={handleCalculate}
                disabled={isLocked}
                className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold px-5 py-1.5 rounded"
              >
                CALCULATE
              </button>
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-1.5 rounded">Choose File</button>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Remarks</label>
              <textarea value={remarks} disabled={isLocked} onChange={(e) => setRemarks(e.target.value)} rows={2} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100" />
            </div>
          </div>
          <div className="w-72 space-y-1.5 shrink-0">
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
              <span className="text-slate-500 font-bold">Total PP</span>
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
            <div className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
              <span className="text-amber-700 font-bold">RTV Adj. Value</span>
              <span className="text-amber-900 font-bold">{fmt4(totals.rtvAdjustmentValue)}</span>
            </div>
            <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5">
              <span className="text-emerald-700 font-bold">Net Payable</span>
              <span className="text-emerald-900 font-bold">{fmt4(totals.netPayable)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
              <span className="text-slate-500 font-bold">Total MRP Value</span>
              <span className="text-slate-900 font-bold">{fmt4(totals.totalMrpValue)}</span>
            </div>
          </div>
          <div className="flex flex-col justify-end gap-1.5 shrink-0">
            <button onClick={handleApprove} disabled={!adj || isLocked || approving} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-bold py-2 px-6 rounded">
              {approving ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner size="xs" variant="white" /> APPROVING...
                </span>
              ) : (
                "APPROVE"
              )}
            </button>
            <button onClick={onNew} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded">
              NEW
            </button>
            <button onClick={handleReport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded">
              REPORT
            </button>
            <button onClick={handleSubmit} disabled={!canSubmit || saving} className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold py-2 px-6 rounded">
              {saving ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner size="xs" /> SAVING...
                </span>
              ) : adj ? (
                "UPDATE"
              ) : (
                "SUBMIT"
              )}
            </button>
          </div>
        </div>
      </div>
      <ReportOverlay html={reportHtml} onClose={() => setReportHtml(null)} />
    </div>
  );
};
