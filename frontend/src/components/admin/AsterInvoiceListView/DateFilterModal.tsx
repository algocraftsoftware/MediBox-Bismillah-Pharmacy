"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { toDateInput } from "./types";

export const DateFilterModal: React.FC<{
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}> = ({ from, to, onApply, onClose }) => {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  // Presets apply + close immediately — no separate FILTER click needed.
  // Custom start/end dates still go through the FILTER button below.
  const preset = (days: number) => {
    const endD = new Date();
    const startD = new Date();
    startD.setDate(startD.getDate() - (days - 1));
    const s = toDateInput(startD);
    const e = toDateInput(endD);
    setStart(s);
    setEnd(e);
    onApply(s, e);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-blue-800 text-white px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm">Filter by Date</h3>
          <button onClick={onClose} className="hover:bg-blue-900 rounded p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-5 gap-1.5">
            <button onClick={() => preset(1)} className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold py-1.5 rounded">
              Today
            </button>
            <button onClick={() => preset(7)} className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold py-1.5 rounded">
              7 Days
            </button>
            <button onClick={() => preset(10)} className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold py-1.5 rounded">
              10 Days
            </button>
            <button onClick={() => preset(15)} className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold py-1.5 rounded">
              15 Days
            </button>
            <button onClick={() => preset(30)} className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold py-1.5 rounded">
              1 Month
            </button>
          </div>
          <div className="text-center text-slate-400 font-bold">— Or Custom Date —</div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Start Date</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5" />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">End Date</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5" />
            </div>
          </div>
          <button
            onClick={() => {
              onApply(start, end);
              onClose();
            }}
            className="w-full bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold py-2 rounded"
          >
            FILTER
          </button>
        </div>
      </div>
    </div>
  );
};
