"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Wallet } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { SalaryRow } from "../../types";
import { DashboardTabBar } from "./DashboardTabBar";
import { PaginationBar } from "./PaginationBar";

const PAGE_SIZE = 10;
const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(m) - 1]} ${y}`;
}

export const AsterEmployeeSalaryView: React.FC = () => {
  const { shopSlug, token } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [month, setMonth] = useState(currentMonth());
  const [months, setMonths] = useState<string[]>([currentMonth()]);
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [payOpen, setPayOpen] = useState<SalaryRow | null>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    api.getSalaryMonths().then((list) => {
      if (list.length) setMonths((prev) => [...new Set([...prev, ...list])]);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getSalaryMonth(month)
      .then((res) => {
        setRows(res.rows);
        if (!months.includes(res.month)) setMonths((prev) => [...new Set([...prev, res.month])]);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load salary data"))
      .finally(() => setLoading(false));
  }, [api, month, months]);

  useEffect(() => {
    load();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const openPay = (row: SalaryRow) => {
    setPayOpen(row);
    setAmount(String(row.amount || row.salary || ""));
    setRemarks(row.remarks ?? "");
    setError(null);
  };

  const confirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOpen) return;
    setSavingId(payOpen.employeeId);
    setError(null);
    try {
      await api.paySalary({
        employeeId: payOpen.employeeId,
        month,
        amount: amount ? Number(amount) : payOpen.salary,
        remarks: remarks.trim() || undefined,
      });
      setPayOpen(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save salary payment");
    } finally {
      setSavingId(null);
    }
  };

  const revert = async (row: SalaryRow) => {
    if (!row.salaryRecordId) return;
    if (!window.confirm(`Mark ${row.employeeName}'s salary as NOT given for ${monthLabel(month)}?`)) return;
    setSavingId(row.employeeId);
    try {
      await api.revertSalary(row.salaryRecordId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revert payment");
    } finally {
      setSavingId(null);
    }
  };

  const paidRows = useMemo(() => rows.filter((r) => r.status === "PAID"), [rows]);
  const totalGiven = useMemo(() => paidRows.reduce((a, r) => a + r.amount, 0), [paidRows]);
  const totalSalary = useMemo(() => rows.reduce((a, r) => a + r.salary, 0), [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
      <DashboardTabBar activeRoute="employee-salary" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full select-none overflow-y-auto flex-1">
      <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-700" />
            Employee Salary
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            {monthLabel(month)} · Given ৳{fmt(totalGiven)} of ৳{fmt(totalSalary)} · {paidRows.length}/{rows.length} paid
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-slate-700">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-white border border-slate-300 rounded px-3 py-1.5 font-bold text-sm"
          >
            {[...months].sort().reverse().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-red-600 font-bold text-sm">{error}</p>}
      {loading && (
        <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
          <Spinner size="xs" /> Loading...
        </div>
      )}

      <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 font-bold">
            No employees found — add employees first from the “Add Employee” section.
          </div>
        ) : (
          <table className="w-full table-fixed text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-200/90 text-slate-800 font-black uppercase whitespace-nowrap">
                <th className="px-4 py-4 border border-slate-300 w-[14%] truncate">Employee</th>
                <th className="px-4 py-4 border border-slate-300 w-[12%] truncate">Mobile</th>
                <th className="px-4 py-4 border border-slate-300 text-right w-[16%] truncate">Monthly Salary</th>
                <th className="px-4 py-4 border border-slate-300 text-right w-[16%] truncate">Given Amount</th>
                <th className="px-4 py-4 border border-slate-300 w-[10%] truncate">Status</th>
                <th className="px-4 py-4 border border-slate-300 w-[12%] truncate">Paid Date</th>
                <th className="px-4 py-4 border border-slate-300 text-right w-[20%] truncate">Action</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap">
              {pageRows.map((r) => {
                const isPaid = r.status === "PAID";
                return (
                  <tr key={r.employeeId} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                    <td className="px-4 py-4 border border-slate-200 font-bold text-slate-800 truncate">{r.employeeName}</td>
                    <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">{r.mobile}</td>
                    <td className="px-4 py-4 border border-slate-200 font-bold text-slate-800 text-right truncate">৳{fmt(r.salary)}</td>
                    <td className="px-4 py-4 border border-slate-200 font-bold text-slate-800 text-right truncate">৳{fmt(r.amount)}</td>
                    <td className="px-4 py-4 border border-slate-200 truncate">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold text-xs px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" /> GIVEN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-700 font-bold text-xs px-2.5 py-1 rounded-full">
                          NOT GIVEN
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">
                      {r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-4 py-4 border border-slate-200 text-right whitespace-nowrap truncate">
                      {isPaid ? (
                        <button
                          onClick={() => revert(r)}
                          disabled={savingId === r.employeeId}
                          className="inline-flex items-center gap-1 text-rose-700 hover:bg-rose-50 font-bold px-2 py-1 rounded disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Mark Not Given
                        </button>
                      ) : (
                        <button
                          onClick={() => openPay(r)}
                          disabled={savingId === r.employeeId}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 font-bold px-2 py-1 rounded disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark As Given
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-black text-slate-800">
                  <td className="px-4 py-4 border border-slate-200" colSpan={2}>
                    Total
                  </td>
                  <td className="px-4 py-4 border border-slate-200 text-right">৳{fmt(totalSalary)}</td>
                  <td className="px-4 py-4 border border-slate-200 text-right">৳{fmt(totalGiven)}</td>
                  <td className="px-4 py-4 border border-slate-200">
                    {paidRows.length}/{rows.length} paid
                  </td>
                  <td className="border border-slate-200" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {rows.length > 0 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={rows.length}
          onFirst={() => setPage(1)}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onLast={() => setPage(totalPages)}
          onPageChange={setPage}
        />
      )}

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={confirmPay} className="bg-white border border-slate-300 rounded-lg max-w-md w-full shadow-2xl">
            <div className="bg-[#047857] text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <span className="font-bold">Mark Salary As Given</span>
              <button type="button" onClick={() => setPayOpen(null)} className="text-white/80 hover:text-white">
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm font-bold text-slate-700">
                {payOpen.employeeName} <span className="font-semibold text-slate-400">· {monthLabel(month)}</span>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Amount Given (৳)</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-semibold"
                  placeholder={`Default: ${payOpen.salary}`}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Remarks (optional)</label>
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-semibold"
                  placeholder="e.g. Paid via cash"
                />
              </div>
            </div>
            {error && <p className="px-4 text-red-600 font-bold text-xs">{error}</p>}
            <div className="p-4 pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayOpen(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingId === payOpen.employeeId}
                className="bg-[#047857] hover:bg-[#065f46] text-white font-bold px-5 py-2 rounded disabled:opacity-60"
              >
                {savingId === payOpen.employeeId ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Spinner size="xs" variant="white" /> Saving...
                  </span>
                ) : (
                  "Confirm Payment"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  );
};
