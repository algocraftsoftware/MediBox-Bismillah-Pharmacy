"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Rtv, RtvVia, Supplier, VstOption } from "../../../types";
import { amountInWords } from "../../../lib/numberToWords";
import { fmt, fmt4 } from "../../../lib/format";
import { ComboSelect as SearchableSelect, ComboOption } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { RtvItemRow, statusLabel, VIA_OPTIONS, viaLabel } from "./types";

// =======================================================
// DETAIL VIEW — single create/edit screen
// =======================================================

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  rtvId: number | null;
  onBack: () => void;
  onCreated: (id: number) => void;
  onNew: () => void;
}> = ({ api, stores, rtvId, onBack, onCreated, onNew }) => {
  const { shopName, logoUrl } = useShopSession();
  const [rtv, setRtv] = useState<Rtv | null>(null);
  const [storeId, setStoreId] = useState("");
  const [via, setVia] = useState<RtvVia>("WAREHOUSE");
  const [supplierId, setSupplierId] = useState("");
  const [vstId, setVstId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverContact, setReceiverContact] = useState("");
  const [remarks, setRemarks] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [vstOptions, setVstOptions] = useState<VstOption[]>([]);
  const [items, setItems] = useState<RtvItemRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(rtvId !== null);
  const [loadingItems, setLoadingItems] = useState(false);

  const isLocked = rtv?.status === "APPROVED";
  const isVstPicked = !!vstId;

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rtvId === null) return;
    setLoading(true);
    api
      .getRtv(rtvId)
      .then((r) => {
        setRtv(r);
        setStoreId(String(r.storeId));
        setVia(r.via);
        setSupplierId(String(r.supplierId));
        setVstId(String(r.vstId));
        setReceiverName(r.receiverName);
        setReceiverContact(r.receiverContact);
        setRemarks(r.remarks || "");
        setItems(
          (r.items || []).map((it) => ({
            vstItemId: it.vstItemId,
            itemCode: it.product.externalCode,
            itemName: it.product.name,
            dosageForm: it.product.dosageForm,
            uom: it.product.unit,
            packSize: it.packSize,
            purchasePrice: it.purchasePrice,
            salesPrice: it.salesPrice,
            batchNo: it.batchNo,
            expiryDate: it.expiryDate.split("T")[0],
            itemQtyPieces: it.itemQtyPieces,
            availableQty: it.itemQtyPieces,
            selected: true,
            rtvQty: String(it.rtvQtyPieces),
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load RTV"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtvId]);

  useEffect(() => {
    if (!storeId || rtv) return;
    api.getRtvVstOptions({ storeId, supplierId: supplierId || undefined }).then(setVstOptions).catch(() => setVstOptions([]));
  }, [api, storeId, supplierId, rtv]);

  const handlePickVst = (id: string) => {
    setVstId(id);
    const opt = vstOptions.find((o) => String(o.id) === id);
    if (opt) setSupplierId(String(opt.supplier.id));
    if (!id) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    api
      .getRtvVstItems(Number(id))
      .then((rows) => {
        setItems(
          rows.map((r) => ({
            vstItemId: r.vstItemId,
            itemCode: r.itemCode,
            itemName: r.itemName,
            dosageForm: r.dosageForm,
            uom: r.uom,
            packSize: r.packSize,
            purchasePrice: r.purchasePrice,
            salesPrice: r.salesPrice,
            batchNo: r.batchNo,
            expiryDate: r.expiryDate.split("T")[0],
            itemQtyPieces: r.itemQtyPieces,
            availableQty: r.availableQty,
            selected: r.availableQty > 0,
            rtvQty: String(r.availableQty),
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load VST items"))
      .finally(() => setLoadingItems(false));
  };

  const setRowSelected = (vstItemId: number, selected: boolean) => {
    setItems((prev) => prev.map((it) => (it.vstItemId === vstItemId ? { ...it, selected } : it)));
  };
  const setRowQty = (vstItemId: number, val: string) => {
    setItems((prev) => prev.map((it) => (it.vstItemId === vstItemId ? { ...it, rtvQty: val } : it)));
  };
  const allSelected = items.length > 0 && items.every((it) => it.selected);
  const toggleAll = () => {
    const next = !allSelected;
    setItems((prev) => prev.map((it) => ({ ...it, selected: next })));
  };

  const computed = useMemo(
    () =>
      items.map((it) => {
        const qty = it.selected ? Math.max(0, Math.min(it.availableQty, Number(it.rtvQty) || 0)) : 0;
        const rtvValue = it.purchasePrice * qty;
        const remainingQty = it.itemQtyPieces - qty;
        const remainingValue = remainingQty * it.salesPrice;
        return { ...it, qty, rtvValue, remainingQty, remainingValue };
      }),
    [items]
  );
  const totalAmount = useMemo(() => computed.reduce((a, i) => a + i.rtvValue, 0), [computed]);

  const canSubmit = storeId && vstId && supplierId && receiverName.trim() && receiverContact.trim() && computed.some((i) => i.qty > 0) && !isLocked;

  const buildPayload = () => ({
    storeId: Number(storeId),
    via,
    vstId: Number(vstId),
    supplierId: Number(supplierId),
    receiverName: receiverName.trim(),
    receiverContact: receiverContact.trim(),
    remarks: remarks || undefined,
    items: computed.map((it) => ({ vstItemId: it.vstItemId, rtvQtyPieces: it.qty })),
  });

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      if (rtv) {
        const result = await api.updateRtv(rtv.id, buildPayload());
        setRtv(result);
        setNotice("RTV saved.");
      } else {
        const result = await api.createRtv(buildPayload());
        setRtv(result);
        onCreated(result.id);
        setNotice(`RTV ${result.rtvNo} created.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save RTV");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!rtv) return;
    setApproving(true);
    setError(null);
    try {
      const result = await api.approveRtv(rtv.id);
      setRtv(result);
      setNotice(`RTV ${result.rtvNo} approved.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve RTV");
    } finally {
      setApproving(false);
    }
  };

  const handleReport = () => {
    const storeName = rtv?.store?.name || stores.find((s) => String(s.id) === storeId)?.name || "";
    const supplierName = rtv?.supplier?.name || suppliers.find((s) => String(s.id) === supplierId)?.name || "";
    const itemRows = computed
      .filter((it) => it.qty > 0)
      .map(
        (it, idx) => `<tr>
          <td>${idx + 1}</td>
          <td>${it.itemCode || ""}</td>
          <td>${it.itemName}</td>
          <td>${it.batchNo}</td>
          <td>${it.expiryDate}</td>
          <td class="right">${fmt(it.purchasePrice)}</td>
          <td class="right">${it.qty}</td>
          <td class="right">${fmt(it.rtvValue)}</td>
        </tr>`
      )
      .join("");
    setReportHtml(`
      <html><head><title>${rtv?.rtvNo || "RTV"}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        .header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .header img{height:48px}
        h1{font-size:16px;margin:0}
        .meta p{margin:2px 0;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #ccc;padding:5px 7px;font-size:11px;text-align:left}
        th{background:#f1f5f9} .right{text-align:right}
        .words{margin-top:8px;font-size:12px}
        .sign{display:flex;justify-content:space-between;margin-top:60px;font-size:12px}
        .sign div{border-top:1px solid #333;padding-top:4px;width:30%;text-align:center}
      </style></head><body>
      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" />` : ""}
        <div>
          <h1>${shopName || ""}</h1>
          <div style="font-size:12px;font-weight:bold">Return To Vendor (RTV) Report</div>
        </div>
      </div>
      <div class="meta">
        <p><b>From Store:</b> ${storeName} &nbsp; <b>RTV VIA:</b> ${viaLabel(via)} &nbsp; <b>RTV No:</b> ${rtv?.rtvNo || ""} &nbsp; <b>RTV Date:</b> ${rtv ? new Date(rtv.createdAt).toLocaleString() : ""}</p>
        <p><b>Supplier:</b> ${supplierName} &nbsp; <b>VST No:</b> ${vstOptions.find((o) => String(o.id) === vstId)?.vstNo || rtv?.vst?.vstNo || ""} &nbsp; <b>Status:</b> ${rtv ? statusLabel(rtv.status) : "Unapproved"}</p>
        <p><b>Receiver:</b> ${receiverName} &nbsp; <b>Contact No:</b> ${receiverContact}</p>
        ${remarks ? `<p><b>Remarks:</b> ${remarks}</p>` : ""}
      </div>
      <table><thead><tr>
        <th>SL</th><th>Item No</th><th>Item Name</th><th>Batch</th><th>Exp.Date</th>
        <th class="right">Purchase Price</th><th class="right">RTV Qty</th><th class="right">RTV Value</th>
      </tr></thead><tbody>${itemRows}</tbody></table>
      <p style="margin-top:10px;text-align:right"><b>Total: ${fmt4(totalAmount)}</b></p>
      <div class="words">In Words: ${amountInWords(totalAmount)}</div>
      <div class="sign">
        <div>Handed Over By</div>
        <div>Received By (${receiverName})</div>
        <div>RTV Approved By</div>
      </div>
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

  const vstOptionCombo: ComboOption[] = vstOptions.map((o) => ({
    value: String(o.id),
    label: o.vstNo,
    sublabel: `${o.supplier.name} · ${new Date(o.createdAt).toLocaleDateString()} · ${fmt(o.totalAmount)}`,
  }));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs">
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">From Store*</label>
            <select
              value={storeId}
              disabled={isLocked || isVstPicked}
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
            <label className="font-bold text-slate-700 block mb-1">RTV No</label>
            <input readOnly value={rtv?.rtvNo || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">RTV Date</label>
            <input readOnly value={rtv ? new Date(rtv.createdAt).toLocaleString() : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <input readOnly value={rtv ? statusLabel(rtv.status) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
            </div>
            <button onClick={onBack} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded shrink-0">
              LIST
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">RTV VIA*</label>
            <select
              value={via}
              disabled={isLocked || isVstPicked}
              onChange={(e) => setVia(e.target.value as RtvVia)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            >
              {VIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier*</label>
            <SearchableSelect
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
              value={supplierId}
              onChange={setSupplierId}
              disabled={isLocked || isVstPicked || !storeId}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User</label>
            <input readOnly value={rtv?.createdBy?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input readOnly value={rtv?.approvedBy?.name || "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">VST No*</label>
            <SearchableSelect
              options={vstOptionCombo}
              value={vstId}
              onChange={handlePickVst}
              disabled={isLocked || isVstPicked || !storeId}
              placeholder={!storeId ? "Select Store first" : "Select..."}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Receiver*</label>
            <input
              value={receiverName}
              disabled={isLocked}
              onChange={(e) => setReceiverName(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Contact No*</label>
            <input
              value={receiverContact}
              disabled={isLocked}
              onChange={(e) => setReceiverContact(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Remarks</label>
            <input
              value={remarks}
              disabled={isLocked}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
        </div>

        {(error || notice) && <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>{error || notice}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">SL</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Item No</th>
              <th className="py-4 px-3 border border-slate-300 w-[10%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Group</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">UOM</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Purchase Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Sales Price</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Item Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">RTV Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">RTV Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Exp.Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Batch</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Rem.Value</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[4%] truncate">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={isLocked} />
              </th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">QOH</th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {computed.map((it, idx) => (
              <tr key={it.vstItemId} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                <td className="py-4 px-3 border border-slate-200 text-slate-500 truncate">{idx + 1}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.itemCode}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{it.itemName}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.dosageForm || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.uom}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.packSize}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.purchasePrice)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.salesPrice)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.itemQtyPieces}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    type="number"
                    min={0}
                    max={it.availableQty}
                    disabled={isLocked || !it.selected}
                    value={it.rtvQty}
                    onChange={(e) => setRowQty(it.vstItemId, e.target.value)}
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(it.rtvValue)}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.expiryDate}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.batchNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.remainingValue)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  <input
                    type="checkbox"
                    checked={it.selected}
                    disabled={isLocked}
                    onChange={(e) => setRowSelected(it.vstItemId, e.target.checked)}
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.remainingQty}</td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={16} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loadingItems ? "Loading VST items..." : "Select a VST No above to load its items."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[#f1f5f9] border-t border-slate-300 px-4 py-1.5 flex items-center justify-end text-xs font-semibold text-slate-600 shrink-0">
        <span>Total Record : </span>
        <span className="font-bold text-slate-900 ml-1">{computed.length}</span>
      </div>

      <div className="bg-white border-t border-slate-300 p-3 shrink-0 text-xs flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2.5">
          <label className="font-bold text-slate-700">Total Amount</label>
          <input readOnly value={fmt(totalAmount)} className="w-48 border border-slate-300 rounded px-2 py-1.5 font-bold bg-slate-100 text-slate-900" />
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={handleApprove}
            disabled={!rtv || isLocked || approving}
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
          <button onClick={handleReport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded">
            REPORT
          </button>
          <button onClick={onNew} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded">
            NEW
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold py-2 px-6 rounded"
          >
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" /> SAVING...
              </span>
            ) : rtv ? (
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
