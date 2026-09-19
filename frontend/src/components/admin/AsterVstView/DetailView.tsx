"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Supplier, Vst, VstSearchItemRow } from "../../../types";
import { ItemEntryTypeahead } from "../ItemEntryTypeahead";
import { amountInWords } from "../../../lib/numberToWords";
import { fmt, fmt4 } from "../../../lib/format";
import { ComboSelect as SearchableSelect } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { statusLabel, toDateInput, VstItemDraft } from "./types";

// =======================================================
// DETAIL VIEW — single create/edit screen (no separate "New"
// header step); Store/Supplier/items are all entered here and
// submitted together on the first Submit.
// =======================================================

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  vstId: number | null;
  onBack: () => void;
  onCreated: (id: number) => void;
  onNew: () => void;
}> = ({ api, stores, vstId, onBack, onCreated, onNew }) => {
  const { shopName, logoUrl } = useShopSession();
  const [vst, setVst] = useState<Vst | null>(null);
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<VstItemDraft[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [stagedRow, setStagedRow] = useState<VstSearchItemRow | null>(null);
  const [stagedQty, setStagedQty] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(vstId !== null);

  const isLocked = vst?.status === "APPROVED";

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (vstId === null) return;
    setLoading(true);
    api
      .getVst(vstId)
      .then((v) => {
        setVst(v);
        setStoreId(String(v.storeId));
        setSupplierId(String(v.supplierId));
        setRemarks(v.remarks || "");
        setItems(
          (v.items || []).map((it) => ({
            productId: it.productId,
            itemCode: it.product.externalCode,
            itemName: it.product.name,
            packSize: it.packSize,
            ppPerPiece: it.ppPerPiece,
            mrpPerPiece: it.mrpPerPiece,
            existingQoh: it.existingQoh,
            batchNo: it.batchNo,
            expiryDate: toDateInput(it.expiryDate),
            vstQtyPieces: String(it.vstQtyPieces),
            remarks: it.remarks || "",
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load VST"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vstId]);

  const fetchItemResults = useCallback(
    async (q: string) => {
      if (!storeId || !supplierId) return [];
      return api.searchVstItems({ storeId, supplierId, q });
    },
    [api, storeId, supplierId]
  );

  const handleSelectItem = (row: VstSearchItemRow) => {
    setStagedRow(row);
    setSearchQuery(row.itemName);
    setStagedQty("");
    setTimeout(() => qtyInputRef.current?.focus(), 0);
  };

  const commitStagedItem = () => {
    if (!stagedRow) return;
    const qty = Math.max(0, Number(stagedQty) || 0);
    if (qty <= 0) return;
    setItems((prev) => [
      ...prev,
      {
        productId: stagedRow.productId,
        itemCode: stagedRow.itemCode,
        itemName: stagedRow.itemName,
        packSize: stagedRow.packSize,
        ppPerPiece: stagedRow.ppPerPiece,
        mrpPerPiece: stagedRow.mrpPerPiece,
        existingQoh: stagedRow.existingQoh,
        batchNo: stagedRow.batchNo,
        expiryDate: toDateInput(stagedRow.expiryDate),
        vstQtyPieces: String(qty),
        remarks: "",
      },
    ]);
    setStagedRow(null);
    setSearchQuery("");
    setStagedQty("");
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const setItemRemarks = (idx: number, val: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, remarks: val } : it)));
  };

  const setItemQty = (idx: number, val: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, vstQtyPieces: val } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const computed = useMemo(
    () =>
      items.map((it) => {
        const vstQtyNum = Math.max(0, Number(it.vstQtyPieces) || 0);
        return {
          ...it,
          vstQtyNum,
          totalPpValue: (it.ppPerPiece || 0) * vstQtyNum,
          finalQoh: it.existingQoh - vstQtyNum,
        };
      }),
    [items]
  );

  const totalAmount = useMemo(() => computed.reduce((a, i) => a + i.totalPpValue, 0), [computed]);

  const canSubmit = storeId && supplierId && items.length > 0 && !isLocked;

  const buildPayload = () => ({
    storeId: Number(storeId),
    supplierId: Number(supplierId),
    remarks: remarks || undefined,
    items: items.map((it) => ({
      productId: it.productId,
      batchNo: it.batchNo,
      vstQtyPieces: Math.max(0, Number(it.vstQtyPieces) || 0),
      remarks: it.remarks || undefined,
    })),
  });

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      if (vst) {
        const result = await api.updateVst(vst.id, buildPayload());
        setVst(result);
        setNotice("VST saved.");
      } else {
        const result = await api.createVst(buildPayload());
        setVst(result);
        onCreated(result.id);
        setNotice(`VST ${result.vstNo} created.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save VST");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!vst) return;
    setApproving(true);
    setError(null);
    try {
      const result = await api.approveVst(vst.id);
      setVst(result);
      setNotice(`VST ${result.vstNo} approved — stock updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve VST");
    } finally {
      setApproving(false);
    }
  };

  const handleReport = () => {
    const storeName = vst?.store?.name || stores.find((s) => String(s.id) === storeId)?.name || "";
    const supplierName = vst?.supplier?.name || suppliers.find((s) => String(s.id) === supplierId)?.name || "";
    const itemRows = computed
      .map(
        (it, idx) => `<tr>
          <td>${idx + 1}</td>
          <td>${it.itemCode || ""}</td>
          <td>${it.itemName}</td>
          <td>${it.packSize}</td>
          <td class="right">${it.vstQtyNum}</td>
          <td>${it.batchNo}</td>
          <td>${it.expiryDate}</td>
          <td class="right">${fmt(it.ppPerPiece)}</td>
          <td class="right">${fmt(it.totalPpValue)}</td>
          <td class="right">${fmt(it.mrpPerPiece)}</td>
          <td class="right">${fmt(it.mrpPerPiece * it.vstQtyNum)}</td>
          <td>${it.remarks || ""}</td>
        </tr>`
      )
      .join("");
    setReportHtml(`
      <html><head><title>${vst?.vstNo || "VST"}</title>
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
          <div style="font-size:12px;font-weight:bold">Item-Wise Virtual Stock Transfer (VST) Report</div>
        </div>
      </div>
      <div class="meta">
        <p><b>Store Name:</b> ${storeName} &nbsp; <b>VST No:</b> ${vst?.vstNo || ""} &nbsp; <b>VST Date &amp; Time:</b> ${vst ? new Date(vst.createdAt).toLocaleString() : ""}</p>
        <p><b>Supplier Name:</b> ${supplierName} &nbsp; <b>Status:</b> ${vst ? statusLabel(vst.status) : "Unapproved"} &nbsp; <b>Approved By:</b> ${vst?.approvedBy?.name || "—"}</p>
        ${remarks ? `<p><b>Remarks:</b> ${remarks}</p>` : ""}
      </div>
      <table><thead><tr>
        <th>SL</th><th>Item Code</th><th>Brand Name</th><th>Pack Size</th><th class="right">VST Qty(PCs)</th>
        <th>Batch No</th><th>Exp.Date</th><th class="right">PP/PCs</th><th class="right">Total PP</th>
        <th class="right">MRP/PCs</th><th class="right">Total MRP</th><th>Remarks</th>
      </tr></thead><tbody>${itemRows}</tbody></table>
      <p style="margin-top:10px;text-align:right"><b>Total: ${fmt4(totalAmount)}</b></p>
      <div class="words">In Words: ${amountInWords(totalAmount)}</div>
      <div class="sign">
        <div>VST Done By</div>
        <div>VST Checked By</div>
        <div>VST Approved By</div>
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

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs">
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store*</label>
            <select
              value={storeId}
              disabled={isLocked || items.length > 0}
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
            <label className="font-bold text-slate-700 block mb-1">VST No</label>
            <input readOnly value={vst?.vstNo || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">VST Date</label>
            <input readOnly value={vst ? new Date(vst.createdAt).toLocaleString() : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="flex-1">
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <input readOnly value={vst ? statusLabel(vst.status) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
            </div>
            <button onClick={onBack} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded shrink-0">
              LIST
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier*</label>
            <SearchableSelect
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
              value={supplierId}
              onChange={setSupplierId}
              disabled={isLocked || items.length > 0}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">VST Remarks</label>
            <input
              value={remarks}
              disabled={isLocked}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User</label>
            <input readOnly value={vst?.createdBy?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input readOnly value={vst?.approvedBy?.name || "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
        </div>

        {(error || notice) && <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>{error || notice}</p>}

        <div className="grid gap-2.5 items-end mt-2.5" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr 1fr 1fr 1fr 1fr 1fr auto" }}>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Item Name</label>
            <ItemEntryTypeahead<VstSearchItemRow>
              value={searchQuery}
              onValueChange={(v) => {
                setSearchQuery(v);
                if (stagedRow && v !== stagedRow.itemName) setStagedRow(null);
              }}
              fetchResults={fetchItemResults}
              onSelect={handleSelectItem}
              getKey={(r) => `${r.productId}-${r.batchNo}`}
              getLabel={(r) => r.itemName}
              getSublabel={(r) => `Batch ${r.batchNo} · Exp ${r.expiryDate.split("T")[0]} · Qty ${r.existingQoh}`}
              placeholder={!storeId || !supplierId ? "Select Store & Supplier first" : "Search item..."}
              disabled={isLocked || !storeId || !supplierId}
              inputRef={searchInputRef}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Dosage Form</label>
            <input readOnly value={stagedRow?.dosageForm || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
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
            <label className="font-bold text-slate-700 block mb-1">Batch</label>
            <input readOnly value={stagedRow?.batchNo || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Expire</label>
            <input readOnly value={stagedRow ? stagedRow.expiryDate.split("T")[0] : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">PP/PCs</label>
            <input readOnly value={stagedRow ? fmt(stagedRow.ppPerPiece) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">MRP/PCs</label>
            <input readOnly value={stagedRow ? fmt(stagedRow.mrpPerPiece) : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Stock Qty</label>
            <input readOnly value={stagedRow?.existingQoh ?? ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Item Qty</label>
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
            ADD
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">SL</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Item No</th>
              <th className="py-4 px-3 border border-slate-300 w-[12%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Pack Size</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">PP/PCs</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">MRP/PCs</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Existing QOH</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">VST Qty (PCs)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Total PP Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Batch</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Exp.Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Remarks</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Final QOH</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[4%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {computed.map((it, idx) => (
              <tr key={`${it.productId}-${it.batchNo}`} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                <td className="py-4 px-3 border border-slate-200 text-slate-500 truncate">{idx + 1}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.itemCode}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{it.itemName}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.packSize}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.ppPerPiece)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{fmt(it.mrpPerPiece)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right text-slate-600 truncate">{it.existingQoh}</td>
          <td className="py-2 px-2 border border-slate-200 text-right truncate">
            <input
              type="number"
              min={0}
              value={it.vstQtyPieces}
              disabled={isLocked}
              onChange={(e) => setItemQty(idx, e.target.value)}
              className="w-20 border border-slate-300 rounded px-1.5 py-1 text-right font-bold text-slate-700 disabled:bg-slate-100"
            />
          </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{fmt(it.totalPpValue)}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.batchNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.expiryDate}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input
                    value={it.remarks}
                    disabled={isLocked}
                    onChange={(e) => setItemRemarks(idx, e.target.value)}
                    className="w-full border border-slate-300 rounded px-1.5 py-1 disabled:bg-slate-100"
                  />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{it.finalQoh}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  {!isLocked && (
                    <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700" title="Remove">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={14} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  No items on this VST yet.
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
            disabled={!vst || isLocked || approving}
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
            ) : vst ? (
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
