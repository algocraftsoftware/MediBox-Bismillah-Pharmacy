"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { Employee } from "../../types";
import { ErrorBanner } from "./ErrorBanner";
import { MobileNumberInput, validateMobileNumber } from "./MobileNumberInput";
import { DashboardTabBar } from "./DashboardTabBar";
import { PaginationBar } from "./PaginationBar";

const EMPTY_FORM = { name: "", address: "", mobile: "", age: "", education: "", salary: "" };
const PAGE_SIZE = 10;

export const AsterEmployeesView: React.FC = () => {
  const { shopSlug, token } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listEmployees()
      .then(setEmployees)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load employees"))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setError(null);
    setForm({
      name: emp.name,
      address: emp.address ?? "",
      mobile: emp.mobile,
      age: emp.age != null ? String(emp.age) : "",
      education: emp.education ?? "",
      salary: emp.salary != null ? String(emp.salary) : "",
    });
    setFormOpen(true);
  };

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.mobile.trim()) {
      setError("Employee name and mobile number are required");
      return;
    }
    const mobileError = validateMobileNumber(form.mobile, { required: true });
    if (mobileError) {
      setMobileWarning(mobileError);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      mobile: form.mobile.trim(),
      age: form.age ? Number(form.age) : null,
      education: form.education.trim() || null,
      salary: form.salary ? Number(form.salary) : 0,
    };
    try {
      if (editing) {
        await api.updateEmployee(editing.id, payload);
      } else {
        await api.createEmployee(payload);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save employee");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (emp: Employee) => {
    if (!window.confirm(`Delete employee "${emp.name}"? This also removes their salary history.`)) return;
    try {
      await api.deleteEmployee(emp.id);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not delete employee");
    }
  };

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.mobile.toLowerCase().includes(q) ||
        (e.education ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, search]);

  const totalMonthlySalary = useMemo(() => employees.reduce((a, e) => a + (e.salary || 0), 0), [employees]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
      <DashboardTabBar activeRoute="employees" />
      <div className="p-6 space-y-5 max-w-6xl mx-auto w-full select-none overflow-y-auto flex-1">
      <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-700" />
            Employees
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            {employees.length} employee{employees.length === 1 ? "" : "s"} · Monthly salary total: ৳
            {totalMonthlySalary.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name / mobile / education"
              className="border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm font-semibold w-64"
            />
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-lg px-4 py-2 text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Employee
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
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400 font-bold">
            {employees.length === 0 ? "No employees yet — click Add Employee to create one." : "No employees match your search."}
          </div>
        ) : (
          <table className="w-full table-fixed text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-200/90 text-slate-800 font-black uppercase whitespace-nowrap">
                <th className="px-4 py-4 border border-slate-300 w-[12%] truncate">Name</th>
                <th className="px-4 py-4 border border-slate-300 w-[12%] truncate">Mobile</th>
                <th className="px-4 py-4 border border-slate-300 w-[20%] truncate">Address</th>
                <th className="px-4 py-4 border border-slate-300 w-[6%] truncate">Age</th>
                <th className="px-4 py-4 border border-slate-300 w-[14%] truncate">Education</th>
                <th className="px-4 py-4 border border-slate-300 text-right w-[14%] truncate">Salary (৳)</th>
                <th className="px-4 py-4 border border-slate-300 text-right w-[22%] truncate">Actions</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap">
              {pageRows.map((e) => (
                <tr key={e.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100">
                  <td className="px-4 py-4 border border-slate-200 font-bold text-slate-800 truncate">{e.name}</td>
                  <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">{e.mobile}</td>
                  <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">{e.address || "—"}</td>
                  <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">{e.age ?? "—"}</td>
                  <td className="px-4 py-4 border border-slate-200 font-semibold text-slate-600 truncate">{e.education || "—"}</td>
                  <td className="px-4 py-4 border border-slate-200 font-bold text-slate-800 text-right truncate">{e.salary.toLocaleString()}</td>
                  <td className="px-4 py-4 border border-slate-200 text-right whitespace-nowrap truncate">
                    <button
                      onClick={() => openEdit(e)}
                      className="inline-flex items-center gap-1 text-blue-700 hover:bg-blue-50 font-bold px-2 py-1 rounded"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => remove(e)}
                      className="inline-flex items-center gap-1 text-red-700 hover:bg-red-50 font-bold px-2 py-1 rounded ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={filtered.length}
          onFirst={() => setPage(1)}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onLast={() => setPage(totalPages)}
          onPageChange={setPage}
        />
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          {mobileWarning && <ErrorBanner message={mobileWarning} onClose={() => setMobileWarning(null)} />}
          <form onSubmit={submit} className="bg-white border border-slate-300 rounded-lg max-w-lg w-full shadow-2xl">
            <div className="bg-[#1e40af] text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <span className="font-bold">{editing ? `Edit Employee — ${editing.name}` : "Add Employee"}</span>
              <button type="button" onClick={() => setFormOpen(false)} className="text-white/80 hover:text-white">
                ×
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <Field label="Name *" value={form.name} onChange={set("name")} placeholder="Employee name" className="col-span-2" />
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">Mobile *</label>
                <MobileNumberInput
                  value={form.mobile}
                  onChange={(v) => setForm((f) => ({ ...f, mobile: v }))}
                  placeholder="01XXXXXXXXX"
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-semibold"
                />
              </div>
              <Field label="Address" value={form.address} onChange={set("address")} placeholder="Address" className="col-span-2" />
              <Field label="Age" value={form.age} onChange={set("age")} placeholder="Age" type="number" />
              <Field label="Education" value={form.education} onChange={set("education")} placeholder="e.g. HSC, B.Pharm" />
              <Field
                label="Monthly Salary (৳)"
                value={form.salary}
                onChange={set("salary")}
                placeholder="0"
                type="number"
                className="col-span-2"
              />
            </div>
            {error && <p className="px-4 text-red-600 font-bold text-xs">{error}</p>}
            <div className="p-4 pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#047857] hover:bg-[#065f46] text-white font-bold px-5 py-2 rounded disabled:opacity-60"
              >
                {saving ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Spinner size="xs" variant="white" /> Saving...
                  </span>
                ) : editing ? (
                  "Update"
                ) : (
                  "Save Employee"
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-bold text-slate-600 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-semibold"
      />
    </div>
  );
}
