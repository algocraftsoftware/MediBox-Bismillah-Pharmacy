"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { Sale } from "../../types";
import { fmt } from "../../lib/format";
import { blockNonIntegerKeys } from "../../lib/numericInput";

export const AsterInvoiceItemCancelView: React.FC = () => {
  const { shopSlug, token } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [cancelQty, setCancelQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleLookup = () => {
    if (!invoiceNo.trim()) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    api
      .lookupSaleByInvoiceNo(invoiceNo.trim())
      .then((s) => {
        setSale(s);
        setSelected({});
        setCancelQty({});
        setReason("");
      })
      .catch((err) => {
        setSale(null);
        setError(err instanceof ApiError ? err.message : "Invoice not found");
      })
      .finally(() => setLoading(false));
  };

  const handleNew = () => {
    setInvoiceNo("");
    setSale(null);
    setSelected({});
    setCancelQty({});
    setReason("");
    setError(null);
    setNotice(null);
  };

  const preview = useMemo(() => {
    if (!sale) return null;
    let removedGrossPlusVat = 0;
    let removedDisc = 0;
    let removedNet = 0;
    for (const it of sale.items) {
      if (!selected[it.id]) continue;
      const qty = Number(cancelQty[it.id]) || 0;
      if (qty <= 0 || it.qty <= 0) continue;
      const ratio = qty / it.qty;
      const netAmt = it.total * ratio;
      const vatAmt = it.vatAmt * ratio;
      const discAmt = it.discAmt * ratio;
      const grossAmt = netAmt - vatAmt + discAmt;
      removedGrossPlusVat += grossAmt + vatAmt;
      removedDisc += discAmt;
      removedNet += netAmt;
    }
    const totalAmount = sale.totalAmount - removedGrossPlusVat;
    const discAmt = sale.discAmt - removedDisc;
    const netAmount = Math.max(0, totalAmount - discAmt);
    const refund = Math.min(sale.paidAmount, removedNet);
    const paidAmount = sale.paidAmount - refund;
    const dueAmount = Math.max(0, netAmount - paidAmount);
    return { totalAmount, discAmt, netAmount, paidAmount, dueAmount, refund };
  }, [sale, selected, cancelQty]);

  const canSubmit =
    !!sale &&
    !!reason.trim() &&
    Object.entries(selected).some(([id, on]) => on && (Number(cancelQty[Number(id)]) || 0) > 0);

  const handleSubmit = async () => {
    if (!sale) return;
    const items = Object.entries(selected)
      .filter(([, on]) => on)
      .map(([id]) => ({ saleItemId: Number(id), qty: Number(cancelQty[Number(id)]) || 0 }))
      .filter((it) => it.qty > 0);
    if (items.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.cancelSaleItems(sale.id, { reason: reason.trim(), items });
      setSale(result);
      setSelected({});
      setCancelQty({});
      setReason("");
      setNotice("Item(s) canceled.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel item(s)");
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmt = preview?.totalAmount ?? sale?.totalAmount ?? 0;
  const discAmt = preview?.discAmt ?? sale?.discAmt ?? 0;
  const netAmt = preview?.netAmount ?? sale?.netAmount ?? 0;
  const paidAmt = preview?.paidAmount ?? sale?.paidAmount ?? 0;
  const refundAmt = preview ? preview.refund : sale?.refundAmount ?? 0;
  const dueAmt = preview?.dueAmount ?? sale?.dueAmount ?? 0;

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs">
        <div className="grid grid-cols-4 gap-2.5 items-end mb-2">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Invoice No*</label>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                onClick={handleLookup}
                disabled={!invoiceNo.trim() || loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-4 py-1 rounded flex items-center justify-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Spinner size="xs" variant="white" /> SEARCHING...
                  </span>
                ) : (
                  "SEARCH"
                )}
              </button>
              <button
                onClick={handleNew}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-1 rounded"
              >
                NEW
              </button>
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Patient Name</label>
            <input readOnly value={sale?.customer?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cust. Id</label>
            <input readOnly value={sale?.customer?.customerCode || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store Name</label>
            <input readOnly value={sale?.store?.name || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2.5 items-end">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Mobile No</label>
            <input readOnly value={sale?.customer?.mobile || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Inv.No_Date</label>
            <input
              readOnly
              value={sale ? `${sale.invoiceNo} __ ${new Date(sale.createdAt).toLocaleString()}` : ""}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Customer Type</label>
            <input readOnly value={sale?.customer?.custType || ""} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold bg-slate-100 text-slate-500" />
          </div>
          <div />
        </div>

        {(error || notice) && <p className={`font-bold text-xs mt-2 ${error ? "text-red-600" : "text-emerald-800"}`}>{error || notice}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {sale ? (
          <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
                <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">SL</th>
                <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Barcode</th>
                <th className="py-4 px-3 border border-slate-300 w-[8%] truncate">Item No</th>
                <th className="py-4 px-3 border border-slate-300 w-[14%] truncate">Item Name</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[8%] truncate">Sales Price</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Bill Qty</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Returned Qty</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Remaining Qty</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[9%] truncate">Total Amount</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">VAT</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Dis.Amt</th>
                <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">Item Qty</th>
                <th className="py-4 px-3 border border-slate-300 text-center w-[5%] truncate"></th>
              </tr>
            </thead>
            <tbody className="font-medium whitespace-nowrap">
              {sale.items.map((it, idx) => {
                const remaining = it.remainingQty ?? it.qty - it.canceledQty;
                return (
                  <tr key={it.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                    <td className="py-4 px-3 border border-slate-200 text-slate-500 truncate">{idx + 1}</td>
                    <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.batch?.barcode || ""}</td>
                    <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{it.product?.externalCode || ""}</td>
                    <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{it.productNameSnapshot}</td>
                    <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(it.mrp)}</td>
                    <td className="py-4 px-3 border border-slate-200 text-right truncate">{it.qty}</td>
                    <td className="py-4 px-3 border border-slate-200 text-right text-amber-700 font-bold truncate">{it.canceledQty || 0}</td>
                    <td className="py-4 px-3 border border-slate-200 text-right font-bold truncate">{remaining}</td>
                    <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(it.mrp * it.qty)}</td>
                    <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(it.vatAmt)}</td>
                    <td className="py-4 px-3 border border-slate-200 text-right truncate">{fmt(it.discAmt)}</td>
                    <td className="py-2 px-2 border border-slate-200 truncate">
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        step="1"
                        disabled={remaining <= 0}
                        value={cancelQty[it.id] ?? ""}
                        onKeyDown={blockNonIntegerKeys}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setCancelQty((prev) => ({ ...prev, [it.id]: "" }));
                            return;
                          }
                          const n = Math.floor(Number(v));
                          if (!Number.isFinite(n) || n < 0) return;
                          setCancelQty((prev) => ({ ...prev, [it.id]: String(n) }));
                        }}
                        className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-4 px-3 border border-slate-200 text-center truncate">
                      <input
                        type="checkbox"
                        disabled={remaining <= 0}
                        checked={!!selected[it.id]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [it.id]: e.target.checked }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center text-slate-400 font-bold text-xs">
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="sm" /> Loading...
              </span>
            ) : (
              "Enter an Invoice No to look up its items."
            )}
          </div>
        )}
      </div>

      {sale && (
        <div className="bg-white border-t border-slate-300 p-3 shrink-0 text-xs flex items-start gap-4">
          <div className="flex-1">
            <label className="font-bold text-slate-700 block mb-1">Cancel Reason*</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div className="w-96 grid grid-cols-3 gap-1.5 shrink-0">
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              <span className="text-slate-500 font-bold">Total Amt</span>
              <span className="text-slate-900 font-bold">{fmt(totalAmt)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              <span className="text-slate-500 font-bold">Disc.Amt</span>
              <span className="text-slate-900 font-bold">{fmt(discAmt)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              <span className="text-slate-500 font-bold">Net Amt</span>
              <span className="text-slate-900 font-bold">{fmt(netAmt)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              <span className="text-slate-500 font-bold">Paid Amt</span>
              <span className="text-slate-900 font-bold">{fmt(paidAmt)}</span>
            </div>
            <div className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <span className="text-amber-700 font-bold">Refund</span>
              <span className="text-amber-900 font-bold">{fmt(refundAmt)}</span>
            </div>
            <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
              <span className="text-emerald-700 font-bold">Due Amt</span>
              <span className="text-emerald-900 font-bold">{fmt(dueAmt)}</span>
            </div>
          </div>
          <div className="flex flex-col justify-end shrink-0">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-40 text-slate-900 hover:text-white font-bold py-2 px-6 rounded"
            >
              {submitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner size="xs" /> SUBMITTING...
                </span>
              ) : (
                "SUBMIT"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
