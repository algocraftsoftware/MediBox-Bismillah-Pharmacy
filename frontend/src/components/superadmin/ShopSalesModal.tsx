"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { superAdminApi } from "../../services/api";
import { Sale, ShopSummary } from "../../types";
import { Spinner } from "../../components/Spinner";

export function ShopSalesModal({ token, shop, onClose }: { token: string; shop: ShopSummary; onClose: () => void }) {
  const [summary, setSummary] = useState<{
    totalSales: number;
    totalDue: number;
    totalOrders: number;
    totalProfit: number;
    recentSales: Sale[];
  } | null>(null);

  useEffect(() => {
    superAdminApi.shopSalesSummary(token, shop.id).then(setSummary);
  }, [token, shop.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-900">{shop.name} — Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!summary ? (
          <div className="flex flex-col items-center justify-center gap-3 py-6">
            <Spinner size="lg" />
            <p className="text-slate-500 font-semibold">Loading...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
              <div className="bg-slate-100 rounded p-3">
                <div className="text-xs text-slate-500 font-bold">Total Sales</div>
                <div className="text-lg font-black text-emerald-700">৳{summary.totalSales.toFixed(2)}</div>
              </div>
              <div className="bg-slate-100 rounded p-3">
                <div className="text-xs text-slate-500 font-bold">Total Profit</div>
                <div className="text-lg font-black text-blue-700">৳{summary.totalProfit.toFixed(2)}</div>
              </div>
              <div className="bg-slate-100 rounded p-3">
                <div className="text-xs text-slate-500 font-bold">Total Due</div>
                <div className="text-lg font-black text-red-600">৳{summary.totalDue.toFixed(2)}</div>
              </div>
              <div className="bg-slate-100 rounded p-3">
                <div className="text-xs text-slate-500 font-bold">Orders</div>
                <div className="text-lg font-black text-slate-900">{summary.totalOrders}</div>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-2">Invoice</th>
                  <th className="py-2">Store</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {summary.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2">{s.invoiceNo}</td>
                    <td className="py-2">{s.store?.name}</td>
                    <td className="py-2">{s.customer?.name || "Walk-in"}</td>
                    <td className="py-2 text-right">৳{s.netAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
