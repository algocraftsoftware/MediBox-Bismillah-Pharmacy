"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Receipt, Trash2, X } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { Expense } from "../../types";
import { DashboardTabBar } from "./DashboardTabBar";
import { PaginationBar } from "./PaginationBar";

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
const fmt = (n: number) => (Number(n || 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
const PAGE_SIZE = 10;

type Preset = "today" | "week" | "month" | "year" | "custom";

export const AsterExpensesView: React.FC = () => {
  const { shopSlug, token } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(toInputDate(new Date()));
  const [to, setTo] = useState(toInputDate(new Date()));

  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listExpenses({ from, to })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
        setPage(1);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load expenses"))
      .finally(() => setLoading(false));
  }, [api, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === "today") {
      setFrom(toInputDate(now));
      setTo(toInputDate(now));
    } else if (p === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setFrom(toInputDate(start));
      setTo(toInputDate(now));
    } else if (p === "month") {
      setFrom(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(toInputDate(now));
    } else if (p === "year") {
      setFrom(toInputDate(new Date(now.getFullYear(), 0, 1)));
      setTo(toInputDate(now));
    }
  };

  const handleAdd = async () => {
    const parsedAmount = Number(amount);
    if (!name.trim()) {
      setError("Expense name is required");
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Price must be a positive number");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createExpense({ name: name.trim(), amount: parsedAmount });
      setName("");
      setAmount("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add expense");
    } finally {
      setSaving(false);
    }
  };

  const handleEditStart = (expense: Expense) => {
    setEditingId(expense.id);
    setEditName(expense.name);
    setEditAmount(String(expense.amount));
    setError(null);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditName("");
    setEditAmount("");
  };

  const handleEditSave = async (id: number) => {
    const parsedAmount = Number(editAmount);
    if (!editName.trim()) {
      setError("Expense name is required");
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Price must be a positive number");
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await api.updateExpense(id, { name: editName.trim(), amount: parsedAmount });
      handleEditCancel();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update expense");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (!window.confirm(`Delete expense "${expense.name}" (৳${fmt(expense.amount)})?`)) return;
    try {
      await api.deleteExpense(expense.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete expense");
    }
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const presetBtn = (p: Preset, label: string) => (
    <button
      onClick={() => applyPreset(p)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        preset === p ? "bg-[#047857] text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
      <DashboardTabBar activeRoute="expenses" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full select-none overflow-y-auto flex-1">
      <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-700" />
              Expenses
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              {rows.length} entr{rows.length === 1 ? "y" : "ies"} · {from} to {to}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Expenses</div>
            <div className="text-2xl font-black text-slate-900">৳{fmt(total)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {presetBtn("today", "Daily")}
          {presetBtn("week", "Weekly")}
          {presetBtn("month", "Monthly")}
          {presetBtn("year", "Yearly")}
          <div className="flex items-center gap-1.5 ml-2">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPreset("custom");
                setFrom(e.target.value);
              }}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            />
            <span className="text-xs font-bold text-slate-400">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPreset("custom");
                setTo(e.target.value);
              }}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm">
        <label className="text-xs font-bold text-slate-600 block mb-2">Add Expense</label>
        <div className="flex items-end gap-2.5">
          <div className="flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Expense Name"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold"
            />
          </div>
          <div className="w-48">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Price"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving}
            title="Add expense"
            className="flex items-center justify-center gap-1.5 bg-[#047857] hover:bg-[#065f46] disabled:opacity-50 text-white font-bold rounded-lg px-4 py-2 text-sm shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" variant="white" /> Adding...
              </span>
            ) : (
              "Add"
            )}
          </button>
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
          <div className="p-10 text-center text-slate-400 font-bold">No expenses recorded for this period.</div>
        ) : (
          <table className="w-full table-fixed text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-200/90 text-slate-800 font-black uppercase whitespace-nowrap">
                <th className="px-4 py-4 border border-slate-300 w-[6%] truncate">Sl</th>
                <th className="px-4 py-4 border border-slate-300 w-[28%] truncate">Expense Name</th>
                <th className="px-4 py-4 border border-slate-300 text-right w-[14%] truncate">Price (৳)</th>
                <th className="px-4 py-4 border border-slate-300 w-[16%] truncate">Added By</th>
                <th className="px-4 py-4 border border-slate-300 w-[16%] truncate">Date</th>
                <th className="px-4 py-4 border border-slate-300 text-right w-[20%] truncate">Actions</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap">
              {pageRows.map((r, idx) => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                    <td className="px-4 py-4 border border-slate-200 text-slate-500 truncate">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-4 py-4 border border-slate-200 font-bold text-slate-800 truncate">
                      {isEditing ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleEditSave(r.id)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm font-bold"
                          autoFocus
                        />
                      ) : (
                        r.name
                      )}
                    </td>
                    <td className="px-4 py-4 border border-slate-200 text-right font-bold text-slate-900 truncate">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleEditSave(r.id)}
                          className="w-28 border border-slate-300 rounded px-2 py-1 text-sm font-bold text-right"
                        />
                      ) : (
                        fmt(r.amount)
                      )}
                    </td>
                    <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">{r.createdBy?.name}</td>
                    <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4 border border-slate-200 text-right truncate">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleEditSave(r.id)}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 font-bold px-2 py-1 rounded"
                          >
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button
                            onClick={handleEditCancel}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50 font-bold px-2 py-1 rounded"
                          >
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleEditStart(r)}
                            className="inline-flex items-center gap-1 text-slate-600 hover:bg-slate-100 font-bold px-2 py-1 rounded"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(r)}
                            className="inline-flex items-center gap-1 text-red-700 hover:bg-red-50 font-bold px-2 py-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 font-black border-t-2 border-emerald-200">
                <td className="px-4 py-4 border border-slate-200" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-4 border border-slate-200 text-right">৳{fmt(total)}</td>
                <td className="px-4 py-4 border border-slate-200" colSpan={3} />
              </tr>
            </tfoot>
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
      </div>
    </div>
  );
};
