"use client";

import React, { useState } from "react";
import { Customer, CustomerType, Gender } from "../../../types";
import { Spinner } from "../../../components/Spinner";
import { MobileNumberInput, validateMobileNumber } from "../MobileNumberInput";
import { ErrorBanner } from "../ErrorBanner";

export function AddCustomerModal({
  stores,
  customer,
  onClose,
  onCreate,
}: {
  stores: { id: number; name: string }[];
  customer?: Customer;
  onClose: () => void;
  onCreate: (data: Partial<Customer>) => Promise<void>;
}) {
  const isEdit = Boolean(customer);
  const [storeId, setStoreId] = useState<number | "">(customer?.storeId ?? stores[0]?.id ?? "");
  const [custType, setCustType] = useState<CustomerType>(customer?.custType ?? "GENERAL");
  const [name, setName] = useState(customer?.name ?? "");
  const [mobile, setMobile] = useState(customer?.mobile ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [passport, setPassport] = useState(customer?.passport ?? "");
  const [nid, setNid] = useState(customer?.nid ?? "");
  const [gender, setGender] = useState<Gender | "">(customer?.gender ?? "");
  const [birthDate, setBirthDate] = useState(customer?.birthDate ? customer.birthDate.split("T")[0] : "");
  const [marriageDate, setMarriageDate] = useState(customer?.marriageDate ? customer.marriageDate.split("T")[0] : "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [orgName, setOrgName] = useState(customer?.orgName ?? "");
  const [designation, setDesignation] = useState(customer?.designation ?? "");
  const [employeeId, setEmployeeId] = useState(customer?.employeeId ?? "");
  const [creditLimit, setCreditLimit] = useState<number>(customer?.creditLimit ?? 0);
  const [creditBalance, setCreditBalance] = useState<number>(customer?.creditBalance ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isVvip = custType === "VVIP";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !name || !mobile) return;
    const mobileError = validateMobileNumber(mobile, { required: true });
    if (mobileError) {
      setMobileWarning(mobileError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        storeId: Number(storeId),
        custType,
        name,
        mobile,
        address: address || undefined,
        passport: passport || undefined,
        nid: nid || undefined,
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        marriageDate: marriageDate || undefined,
        email: email || undefined,
        orgName: orgName || undefined,
        designation: designation || undefined,
        employeeId: employeeId || undefined,
        creditLimit: isVvip ? creditLimit : 0,
        creditBalance: isVvip ? creditBalance : 0,
      });
    } catch (err: any) {
      if (err.message === "ALREADY_EXISTS") {
        const { default: Swal } = await import("sweetalert2");
        Swal.fire({
          icon: "warning",
          title: "Already Registered",
          text: "a customer is regestered with this number",
          confirmButtonColor: "#ADEBB3",
        });
      } else {
        setError(err.message || "Could not register customer");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {mobileWarning && <ErrorBanner message={mobileWarning} onClose={() => setMobileWarning(null)} />}
      <div className="bg-white border border-slate-300 rounded-lg max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3 mb-4">
          {isEdit ? "Edit Customer Information" : "Customer Information"}
        </h3>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Store Name*</label>
            <select
              required
              value={storeId}
              onChange={(e) => setStoreId(Number(e.target.value))}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            >
              <option value="">Choose...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Customer Type*</label>
            <select
              value={custType}
              onChange={(e) => setCustType(e.target.value as CustomerType)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            >
              <option value="GENERAL">GENERAL</option>
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="OTHER">OTHER</option>
              <option value="VVIP">VVIP CUSTOMER</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Customer Name*</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            >
              <option value="">Choose...</option>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Mobile No.*</label>
            <MobileNumberInput
              value={mobile}
              onChange={setMobile}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
              placeholder="0158038xxxx"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Birth Day</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Customer Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Marriage Day</label>
            <input
              type="date"
              value={marriageDate}
              onChange={(e) => setMarriageDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">NID</label>
            <input
              value={nid}
              onChange={(e) => setNid(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Passport</label>
            <input
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Email Id</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
            />
          </div>
          {isVvip && (
            <>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Credit Limit</label>
                <input
                  type="number"
                  min="0"
                  value={creditLimit || ""}
                  onKeyDown={(e) => {
                    if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
                  }}
                  onChange={(e) => setCreditLimit(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Credit Balance</label>
                <input
                  type="number"
                  min="0"
                  value={creditBalance || ""}
                  onKeyDown={(e) => {
                    if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
                  }}
                  onChange={(e) => setCreditBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold pointer-events-none"
                />
              </div>
            </>
          )}

          {custType === "EMPLOYEE" && (
            <>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Organization Name</label>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Designation / Dept.</label>
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
                />
              </div>
              <div className="col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Employee Id / PF</label>
                <input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold"
                />
              </div>
            </>
          )}

          {error && <p className="col-span-2 text-red-600 font-bold">{error}</p>}

          <div className="col-span-2 flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-60 text-slate-900 hover:text-white font-bold shadow"
            >
              {submitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner size="xs" /> {isEdit ? "Updating..." : "Registering..."}
                </span>
              ) : isEdit ? (
                "Update Customer"
              ) : (
                "Register Customer"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
