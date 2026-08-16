"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { ApiError } from "../../../services/api";
import { Sale } from "../../../types";
import { Spinner } from "../../../components/Spinner";
import { BANGLADESH_BANKS, CARD_TYPES, MOBILE_BANKING_TYPES } from "../../../lib/bdPaymentOptions";
import { TypeaheadInput } from "../TypeaheadInput";

export const ReceivePaymentModal: React.FC<{
  sale: Sale;
  onConfirm: (data: {
    paidCash: number;
    paidMobileBanking: number;
    paidCard: number;
    mobileBankingType?: string;
    transactionNumber?: string;
    cardType?: string;
    bankName?: string;
    remarks?: string;
  }) => Promise<void>;
  onClose: () => void;
}> = ({ sale, onConfirm, onClose }) => {
  const [paidCash, setPaidCash] = useState(0);
  const [paidMobileBanking, setPaidMobileBanking] = useState(0);
  const [paidCard, setPaidCard] = useState(0);
  const [mobileBankingType, setMobileBankingType] = useState("");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [cardType, setCardType] = useState("");
  const [bankName, setBankName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const received = (paidCash || 0) + (paidMobileBanking || 0) + (paidCard || 0);
  const remaining = sale.dueAmount - received;

  const handleSubmit = async () => {
    setError(null);
    if (received <= 0) return setError("Enter a payment amount to receive");
    if (received > sale.dueAmount + 0.01) return setError("Amount exceeds the outstanding due");
    if (paidMobileBanking > 0 && !mobileBankingType) return setError("Select a Mobile Banking Type for the Mobile Banking amount entered");
    if (paidCard > 0 && (!cardType || !bankName)) return setError("Select a Card Type and Bank Name for the Card Payment amount entered");
    setSubmitting(true);
    try {
      await onConfirm({
        paidCash,
        paidMobileBanking,
        paidCard,
        mobileBankingType: mobileBankingType || undefined,
        transactionNumber: transactionNumber || undefined,
        cardType: cardType || undefined,
        bankName: bankName || undefined,
        remarks: remarks || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to receive payment");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm">Receive Due Payment</h3>
          <button onClick={onClose} className="hover:bg-emerald-800 rounded p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-xs">
          <div className="bg-slate-100 border border-slate-300 rounded p-2.5 flex justify-between font-bold text-slate-700">
            <span>
              Invoice No: <span className="text-slate-900">{sale.invoiceNo}</span> · Customer:{" "}
              <span className="text-slate-900">{sale.customer?.name || "Walk-in"}</span>
            </span>
            <span>
              Due: <span className="text-red-600">{sale.dueAmount.toFixed(2)}</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Cash</label>
              <input
                type="number"
                min={0}
                value={paidCash || ""}
                onChange={(e) => setPaidCash(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Mobile Banking</label>
              <input
                type="number"
                min={0}
                value={paidMobileBanking || ""}
                onChange={(e) => setPaidMobileBanking(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Card</label>
              <input
                type="number"
                min={0}
                value={paidCard || ""}
                onChange={(e) => setPaidCard(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
          </div>

          {paidMobileBanking > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Mobile Banking Type</label>
                <TypeaheadInput
                  value={mobileBankingType}
                  onChange={setMobileBankingType}
                  options={MOBILE_BANKING_TYPES}
                  placeholder="Type or select..."
                  className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Transaction Number</label>
                <input
                  value={transactionNumber}
                  onChange={(e) => setTransactionNumber(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
            </div>
          )}

          {paidCard > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Card Type</label>
                <TypeaheadInput
                  value={cardType}
                  onChange={setCardType}
                  options={CARD_TYPES}
                  placeholder="Type or select..."
                  className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Bank Name</label>
                <TypeaheadInput
                  value={bankName}
                  onChange={setBankName}
                  options={BANGLADESH_BANKS}
                  placeholder="Type or select..."
                  className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
                />
              </div>
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 block mb-1">Remarks</label>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5"
            />
          </div>

          <div className="flex justify-between items-center font-bold text-slate-700">
            <span>Receiving:</span>
            <span className="text-emerald-700">{received.toFixed(2)}</span>
            <span>Remaining Due:</span>
            <span className={remaining > 0.01 ? "text-red-600" : "text-emerald-700"}>{remaining > 0.01 ? remaining.toFixed(2) : "0.00"}</span>
          </div>

          {error && <p className="text-red-600 font-bold text-xs">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded">
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-50 text-slate-900 hover:text-white font-bold px-4 py-2 rounded"
            >
              {submitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner size="xs" /> SAVING...
                </span>
              ) : (
                "RECEIVE"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
