"use client";

import React, { useMemo, useState } from "react";
import { Building2, Check } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../Spinner";
import { useAppDispatch } from "../../store/hooks";
import { lookupInvalidated } from "../../store/lookupsSlice";
import { MediboxHeader } from "./MediboxHeader";

// Adding a vendor the pharmacy has started buying from, so they can be picked
// on Create Stock, Purchase Requisition, GRN and everywhere else a supplier is
// chosen — no different from a vendor that came with the catalog.
export const MediboxCreateVendorView: React.FC = () => {
  const {
    shopSlug, token, shopName, logoUrl, adminName, permissions, adminRole, stores,
    selectedStoreId, setSelectedStoreId, logout,
  } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);
  const dispatch = useAppDispatch();

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMode, setPaymentMode] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canPublish = name.trim().length > 0 && !saving;

  const handlePublish = async () => {
    if (!canPublish) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.createSupplier({
        name: name.trim(),
        contact: contact.trim() || undefined,
        address: address.trim() || undefined,
        paymentMode: paymentMode.trim() || undefined,
      });
      // Every screen reads the vendor list from one shared cache. Without this
      // the new vendor would not appear in those dropdowns until the cache
      // expired, which would look as though it had not been created.
      dispatch(lookupInvalidated({ name: "suppliers", shopSlug }));
      setNotice(`${created.name} published — it can now be selected anywhere a vendor is chosen.`);
      setName("");
      setContact("");
      setAddress("");
      setPaymentMode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this vendor");
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { placeholder?: string; required?: boolean; textarea?: boolean } = {},
  ) => (
    <div>
      <label className="font-bold text-slate-700 block mb-1 text-sm">
        {label}
        {opts.required && <span className="text-red-600">*</span>}
      </label>
      {opts.textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={opts.placeholder}
          rows={3}
          className="w-full border border-slate-300 rounded px-3 py-2 font-semibold"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePublish()}
          placeholder={opts.placeholder}
          className="w-full border border-slate-300 rounded px-3 py-2 font-semibold"
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
      <MediboxHeader
        shopSlug={shopSlug}
        activeRoute="create-vendor"
        shopName={shopName}
        logoUrl={logoUrl}
        adminName={adminName}
        permissions={permissions}
        adminRole={adminRole}
        stores={stores}
        selectedStoreId={selectedStoreId}
        setSelectedStoreId={setSelectedStoreId}
        onLogout={logout}
      />

      <div className="p-5 overflow-y-auto flex-1">
        <div className="max-w-2xl bg-white border border-slate-300 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200">
            <Building2 className="w-5 h-5 text-emerald-700" />
            <span className="font-black text-slate-800 uppercase text-sm">Create Vendor</span>
          </div>

          <div className="p-5 space-y-4">
            {field("Vendor Name", name, setName, { placeholder: "e.g. Square Pharmaceuticals Ltd", required: true })}
            {field("Vendor Mobile Number", contact, setContact, { placeholder: "e.g. 01700000000" })}
            {field("Payment Mode", paymentMode, setPaymentMode, { placeholder: "e.g. Cash, Credit, Cheque" })}
            {field("Vendor Address", address, setAddress, { placeholder: "Street, area, city", textarea: true })}

            {error && <p className="text-red-600 font-bold text-sm">{error}</p>}
            {notice && (
              <p className="text-emerald-700 font-bold text-sm inline-flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                {notice}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handlePublish}
                disabled={!canPublish}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-bold py-2 px-8 rounded inline-flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Spinner size="xs" variant="white" /> PUBLISHING...
                  </>
                ) : (
                  "PUBLISH"
                )}
              </button>
              <span className="text-xs font-semibold text-slate-400">
                Vendor Name is required; everything else can be filled in later.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
