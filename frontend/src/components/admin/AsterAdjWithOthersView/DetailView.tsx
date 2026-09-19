"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { AdjOthers, AdjOthersType, RtvAdjustOption, RtvVia, Supplier } from "../../../types";
import { amountInWords } from "../../../lib/numberToWords";
import { fmt, fmt4 } from "../../../lib/format";
import { ComboSelect as SearchableSelect, ComboOption } from "../ComboSelect";
import { ReportOverlay } from "../ReportOverlay";
import { ADJ_TYPES, adjTypeLabel, RtvLineDraft, statusLabel, VIA_OPTIONS, viaLabel } from "./types";

export const DetailView: React.FC<{
  api: ReturnType<typeof shopApi>;
  stores: { id: number; name: string }[];
  adjId: number | null;
  onBack: () => void;
  onCreated: (id: number) => void;
  onNew: () => void;
}> = ({ api, stores, adjId, onBack, onCreated, onNew }) => {
  const { shopName, logoUrl } = useShopSession();
  const [adj, setAdj] = useState<AdjOthers | null>(null);
  const [storeId, setStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [adjType, setAdjType] = useState<AdjOthersType>("SUPPLIER");
  const [via, setVia] = useState<RtvVia>("WAREHOUSE");
  const [remarks, setRemarks] = useState("");

  const [rtvLines, setRtvLines] = useState<RtvLineDraft[]>([]);
  const [rtvPickId, setRtvPickId] = useState("");
  const [rtvOptions, setRtvOptions] = useState<RtvAdjustOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(adjId !== null);

  const isLocked = adj?.status === "APPROVED";
  const isHeaderLocked = isLocked || rtvLines.length > 0;

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (adjId === null) return;
    setLoading(true);
    api
      .getAdjOthers(adjId)
      .then((a) => {
        setAdj(a);
        setStoreId(String(a.storeId));
        setSupplierId(String(a.supplierId));
        setAdjType(a.adjType);
        setVia(a.via);
        setRemarks(a.remarks || "");
        setRtvLines(
          (a.items || []).map((it) => ({
            rtvId: it.rtvId,
            rtvNo: it.rtv.rtvNo,
            rtvDate: new Date(it.rtv.createdAt).toLocaleDateString(),
            storeName: it.rtv.store.name,
            rtvAmount: it.rtv.totalAmount,
            availableBalance: it.rtv.totalAmount,
            adjustmentAmount: String(it.adjustmentAmount),
          }))
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load adjustment"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjId]);

  // Supplier alone is enough to look up their adjustable RTVs — Store isn't
  // part of an RTV's credit (it's owed by the supplier shop-wide), so it
  // isn't required before the list can populate.
  useEffect(() => {
    if (!supplierId) {
      setRtvOptions([]);
      return;
    }
    api.getAdjOthersRtvOptions({ storeId: storeId || undefined, supplierId }).then(setRtvOptions).catch(() => setRtvOptions([]));
  }, [api, storeId, supplierId]);

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

  const totalAdjustmentAmount = useMemo(
    () => rtvLines.reduce((a, l) => a + Math.max(0, Math.min(l.availableBalance, Number(l.adjustmentAmount) || 0)), 0),
    [rtvLines]
  );

  const canSubmit = storeId && supplierId && adjType && via && rtvLines.length > 0 && !isLocked;

  const buildPayload = () => ({
    storeId: Number(storeId),
    supplierId: Number(supplierId),
    adjType,
    via,
    remarks: remarks || undefined,
    items: rtvLines.map((l) => ({ rtvId: l.rtvId, adjustmentAmount: Math.max(0, Math.min(l.availableBalance, Number(l.adjustmentAmount) || 0)) })),
  });

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      if (adj) {
        const result = await api.updateAdjOthers(adj.id, buildPayload());
        setAdj(result);
        setNotice("Adjustment saved.");
      } else {
        const result = await api.createAdjOthers(buildPayload());
        setAdj(result);
        onCreated(result.id);
        setNotice(`Adjustment ${result.txnNo} created.`);
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
      const result = await api.approveAdjOthers(adj.id);
      setAdj(result);
      setNotice(`Adjustment ${result.txnNo} approved.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve adjustment");
    } finally {
      setApproving(false);
    }
  };

  const handleReport = () => {
    const storeName = adj?.store?.name || stores.find((s) => String(s.id) === storeId)?.name || "";
    const supplierName = adj?.supplier?.name || suppliers.find((s) => String(s.id) === supplierId)?.name || "";
    const rtvRows = rtvLines
      .map((l, idx) => `<tr><td>${idx + 1}</td><td>${l.rtvNo}</td><td>${l.rtvDate}</td><td>${l.storeName}</td><td class="right">${fmt(l.rtvAmount)}</td><td class="right">${fmt(Number(l.adjustmentAmount) || 0)}</td></tr>`)
      .join("");
    setReportHtml(`
      <html><head><title>${adj?.txnNo || "ADJO"}</title>
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
        <div><h1>${shopName || ""}</h1><div style="font-size:12px;font-weight:bold">Adjustment With Others Report</div></div>
      </div>
      <div class="meta">
        <p><b>ADJ.Store:</b> ${storeName} &nbsp; <b>Adjust.Type:</b> ${adjTypeLabel(adjType)} &nbsp; <b>RTV VIA:</b> ${viaLabel(via)} &nbsp; <b>Trans No:</b> ${adj?.txnNo || ""}</p>
        <p><b>Supplier:</b> ${supplierName} &nbsp; <b>Status:</b> ${adj ? statusLabel(adj.status) : "Unapproved"}</p>
        ${remarks ? `<p><b>Remarks:</b> ${remarks}</p>` : ""}
      </div>
      <table><thead><tr><th>SL</th><th>RTV No</th><th>RTV Date</th><th>Store Name</th><th class="right">RTV Amt</th><th class="right">Adj Amt</th></tr></thead><tbody>${rtvRows}</tbody></table>
      <p style="margin-top:10px;text-align:right"><b>RTV Adj. Amt: ${fmt4(totalAdjustmentAmount)}</b></p>
      <div class="words">In Words: ${amountInWords(totalAdjustmentAmount)}</div>
      <div class="sign"><div>Prepared By</div><div>Checked By</div><div>Approved By</div></div>
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
            <select value={storeId} disabled={isHeaderLocked} onChange={(e) => setStoreId(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              <option value="">Select...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Adjust.Type*</label>
            <select value={adjType} disabled={isHeaderLocked} onChange={(e) => setAdjType(e.target.value as AdjOthersType)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              {ADJ_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans.No</label>
            <input readOnly value={adj?.txnNo || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
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
              disabled={isHeaderLocked || !storeId}
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">RTV VIA*</label>
            <select value={via} disabled={isHeaderLocked} onChange={(e) => setVia(e.target.value as RtvVia)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100">
              {VIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Trans. Date</label>
            <input readOnly value={adj ? new Date(adj.createdAt).toLocaleString() : ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User Name</label>
            <input readOnly value={adj?.createdBy?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved By</label>
            <input readOnly value={adj?.approvedBy?.name || "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Approved Date</label>
            <input readOnly value={adj?.approvedAt ? new Date(adj.approvedAt).toLocaleString() : "—"} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div className="col-span-2" />
        </div>

        {(error || notice) && <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>{error || notice}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white p-3">
        <div className="max-w-md mb-3">
          <label className="font-bold text-slate-700 block mb-1 text-xs">RTV No</label>
          <SearchableSelect options={rtvCombo} value={rtvPickId} onChange={handlePickRtv} disabled={isLocked || !supplierId} placeholder={!supplierId ? "Select Supplier first" : "Select..."} />
        </div>

        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap">
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">SL</th>
              <th className="py-4 px-3 border border-slate-300 w-[17%] truncate">RTV No</th>
              <th className="py-4 px-3 border border-slate-300 w-[16%] truncate">RTV Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[24%] truncate">Store Name</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[15%] truncate">RTV Amt</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[14%] truncate">ADJ Amt</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[8%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rtvLines.map((l, idx) => (
              <tr key={l.rtvId} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                <td className="py-4 px-3 border border-slate-200 text-slate-500 truncate">{idx + 1}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{l.rtvNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{l.rtvDate}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{l.storeName}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(l.rtvAmount)}</td>
                <td className="py-2 px-2 border border-slate-200 truncate">
                  <input type="number" min={0} max={l.availableBalance} disabled={isLocked} value={l.adjustmentAmount} onChange={(e) => setRtvLineAmt(l.rtvId, e.target.value)} className="w-full border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100" />
                </td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  {!isLocked && (
                    <button onClick={() => removeRtvLine(l.rtvId)} className="text-red-500 hover:text-red-700" title="Remove">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rtvLines.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  No RTVs selected yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-slate-500 font-semibold text-xs mt-2">Total Record : {rtvLines.length}</p>
      </div>

      <div className="bg-white border-t border-slate-300 p-3 shrink-0 text-xs flex items-start gap-4">
        <div className="flex-1 flex items-end gap-2.5">
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-1.5 rounded">Choose File</button>
          <div className="flex-1">
            <label className="font-bold text-slate-700 block mb-1">Remarks</label>
            <textarea value={remarks} disabled={isLocked} onChange={(e) => setRemarks(e.target.value)} rows={2} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold disabled:bg-slate-100" />
          </div>
        </div>
        <div className="w-56 shrink-0">
          <label className="font-bold text-slate-700 block mb-1">RTV Adj. Amt.</label>
          <input readOnly value={fmt4(totalAdjustmentAmount)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-bold bg-slate-100 text-slate-900" />
        </div>
        <div className="flex gap-1.5 shrink-0">
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
      <ReportOverlay html={reportHtml} onClose={() => setReportHtml(null)} />
    </div>
  );
};
