"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { Customer } from "../../../types";
import { AddCustomerModal } from "./AddCustomerModal";
import { PaginationBar } from "../PaginationBar";

const PAGE_SIZE = 10;

export { AddCustomerModal };

export const AsterCustomerRegistrationView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [filterStoreId, setFilterStoreId] = useState<string>("");
  const [filterCustType, setFilterCustType] = useState<string>("");
  const [filterGender, setFilterGender] = useState<string>("");
  const [filterCode, setFilterCode] = useState("");
  const [filterMobile, setFilterMobile] = useState("");
  const [filterEmployeeId, setFilterEmployeeId] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await api.searchCustomers({
        storeId: filterStoreId || undefined,
        custType: filterCustType || undefined,
        gender: filterGender || undefined,
        customerCode: filterCode || undefined,
        mobile: filterMobile || undefined,
        employeeId: filterEmployeeId || undefined,
      });
      setCustomers(results);
      setPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const searchByMobile = async (mobile: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await api.searchCustomers({ mobile });
      setCustomers(results);
      setPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setFilterStoreId("");
    setFilterCustType("");
    setFilterGender("");
    setFilterCode("");
    setFilterMobile("");
    setFilterEmployeeId("");
    setCustomers([]);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const pageCustomers = customers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] text-slate-800 font-sans select-none overflow-hidden">
      {/* Filter Bar */}
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-12 gap-3 items-end text-xs">
          <div className="col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Store Name</label>
            <select
              value={filterStoreId}
              onChange={(e) => setFilterStoreId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-semibold"
            >
              <option value="">All Stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Customer Id</label>
            <input
              type="text"
              value={filterCode}
              onChange={(e) => setFilterCode(e.target.value)}
              placeholder="e.g. 0000012"
              className="w-full bg-white border border-slate-300 rounded px-2 py-1"
            />
          </div>

          <div className="col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Customer Type</label>
            <select
              value={filterCustType}
              onChange={(e) => setFilterCustType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1"
            >
              <option value="">All Types</option>
              <option value="GENERAL">GENERAL</option>
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="OTHER">OTHER</option>
              <option value="VVIP">VVIP CUSTOMER</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Gender</label>
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1"
            >
              <option value="">Select Gender</option>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Mobile / EID-PF</label>
            <input
              type="text"
              value={filterMobile}
              onChange={(e) => {
                setFilterMobile(e.target.value);
                setFilterEmployeeId(e.target.value);
              }}
              placeholder="Search..."
              className="w-full bg-white border border-slate-300 rounded px-2 py-1"
            />
          </div>

          <div className="col-span-2 flex items-center gap-2 justify-end">
            <button
              onClick={runSearch}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1 rounded text-xs flex items-center gap-1 shadow"
            >
              <Search className="w-3.5 h-3.5" />
              <span>SEARCH</span>
            </button>
            <button
              onClick={handleClearFilters}
              className="bg-[#dc2626] hover:bg-red-700 text-white font-bold px-3 py-1 rounded text-xs shadow"
            >
              CLEAR
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-black px-3 py-1 rounded text-xs shadow"
              title="Add New Customer"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#f1f5f9] border-b border-slate-300 px-4 py-2 flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>{loading ? (<span className="inline-flex items-center gap-2"><Spinner size="xs" /> Searching...</span>) : (error || " ")}</span>
        <div>
          <span>Total Record : </span>
          <span className="font-bold text-slate-900">{customers.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-700 font-bold uppercase whitespace-nowrap">
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">STORE NAME</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">CUSTOMER ID</th>
              <th className="py-4 px-3 border border-slate-300 w-[12%] truncate">CUSTOMER NAME</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">TYPE</th>
              <th className="py-4 px-3 border border-slate-300 w-[11%] truncate">PHONE NUMBER</th>
              <th className="py-4 px-3 border border-slate-300 w-[10%] truncate">ADDRESS</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">BIRTH DATE</th>
              <th className="py-4 px-3 border border-slate-300 w-[9%] truncate">ENTRY DATE</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[10%] truncate">CREDIT LIMIT</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[7%] truncate">REWARD</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[8%] truncate">EDIT</th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {pageCustomers.map((c) => (
              <tr key={c.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50 transition-colors">
                <td className="py-4 px-3 border border-slate-200 font-semibold text-slate-700 truncate">{c.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-emerald-800 truncate">{c.customerCode}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{c.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{c.custType === "VVIP" ? "VVIP CUSTOMER" : c.custType}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-700 truncate">{c.mobile}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{c.address || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-500 truncate">{c.birthDate ? c.birthDate.split("T")[0] : "N/A"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{c.creditLimit.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{c.rewardBalance.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-center truncate">
                  <button
                    onClick={() => setEditingCustomer(c)}
                    className="text-blue-600 hover:text-blue-800 font-bold underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}

            {customers.length === 0 && !loading && (
              <tr>
                <td colSpan={11} className="py-16 border border-slate-200 text-center text-slate-400 font-semibold">
                  No customers found. Use Search above or click the green &quot;+&quot; button to register a customer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={customers.length}
        onFirst={() => setPage(1)}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        onLast={() => setPage(totalPages)}
        onPageChange={setPage}
      />

      {showAddForm && (
        <AddCustomerModal
          stores={stores}
          onClose={() => setShowAddForm(false)}
          onCreate={async (data) => {
            if (data.mobile) {
              const existing = await api.searchCustomers({ mobile: data.mobile });
              if (existing.length > 0) {
                throw new Error("ALREADY_EXISTS");
              }
            }
            const created = await api.createCustomer(data);
            setShowAddForm(false);
            setFilterStoreId("");
            setFilterCustType("");
            setFilterGender("");
            setFilterCode("");
            setFilterMobile(created.mobile);
            setFilterEmployeeId("");
            await searchByMobile(created.mobile);
          }}
        />
      )}

      {editingCustomer && (
        <AddCustomerModal
          stores={stores}
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onCreate={async (data) => {
            const updated = await api.updateCustomer(editingCustomer.id, data);
            setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setEditingCustomer(null);
          }}
        />
      )}
    </div>
  );
};
