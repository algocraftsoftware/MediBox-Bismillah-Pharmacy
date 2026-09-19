"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { session, superAdminApi, ApiError } from "../../../../../services/api";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_STAFF_PERMISSIONS } from "../../../../../lib/menuFeatures";
import { Spinner } from "../../../../../components/Spinner";
import { ShopLogoBadge } from "../../../../../components/admin/ShopLogoBadge";
import { FormSection } from "../../../../../components/superadmin/FormSection";
import { TextField } from "../../../../../components/superadmin/TextField";
import { PermissionChecklist } from "../../../../../components/superadmin/PermissionChecklist";
import { SignatureUploadField } from "../../../../../components/superadmin/SignatureUploadField";
import { SlugInput } from "../../../../../components/superadmin/SlugInput";

export default function NewShopPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [signaturePreparedBy, setSignaturePreparedBy] = useState<File | null>(null);
  const [signatureReviewedBy, setSignatureReviewedBy] = useState<File | null>(null);
  const [signatureApprovedBy, setSignatureApprovedBy] = useState<File | null>(null);

  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPermissions, setAdminPermissions] = useState<string[]>(DEFAULT_ADMIN_PERMISSIONS);

  const [staffName, setStaffName] = useState("");
  const [staffUsername, setStaffUsername] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffPermissions, setStaffPermissions] = useState<string[]>(DEFAULT_STAFF_PERMISSIONS);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const sess = session.getSuperAdmin();
    if (!sess) {
      router.replace("/superadmin/login");
      return;
    }
    setToken(sess.token);
  }, [router]);

  if (!token) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await superAdminApi.createShop(token, {
        code,
        name,
        slug,
        address: address || undefined,
        phone: phone || undefined,
        adminName,
        adminUsername,
        adminPassword,
        adminPermissions,
        staffName,
        staffUsername,
        staffPassword,
        staffPermissions,
        logo,
        signaturePreparedBy,
        signatureReviewedBy,
        signatureApprovedBy,
      });
      router.push("/superadmin?toast=" + encodeURIComponent("Shop created — the full medicine catalog (17k+ items) is being loaded into it now."));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create shop");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push("/superadmin")}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Total Shop
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-800" />
          <span className="font-black text-base">Enroll New Shop</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="text-sm space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <FormSection title="Shop Details">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  required
                  label="Shop ID"
                  hint="used to find this shop in search"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. MEDIBOX001"
                />
                <TextField
                  required
                  label="Shop Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. MediBox Pharmacy"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Login URL Slug</label>
                <SlugInput value={slug} onChange={setSlug} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label="Shop Address"
                  hint="optional"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Road-27, Dhanmondi, Dhaka"
                />
                <TextField
                  label="Shop Phone"
                  hint="optional"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 01886704666"
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Shop Logo" description="Shown in the header and menu. No logo? The shop name is shown in a badge instead.">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogo(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-500"
            />
            <div className="mt-3">
              {logo ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(logo)}
                    alt="New logo"
                    className="h-9 w-9 rounded object-cover bg-white border border-slate-200"
                  />
                  <span className="text-xs text-slate-500 font-semibold">Logo selected — will be uploaded</span>
                </div>
              ) : (
                <ShopLogoBadge name={name} logoUrl={null} />
              )}
            </div>
          </FormSection>
        </div>

        <FormSection
          title="Sign-Off Signatures"
          description="Stamped onto printed documents (e.g. Purchase Order) that reserve these signature slots. All optional."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SignatureUploadField label="Prepared By" file={signaturePreparedBy} onChange={setSignaturePreparedBy} />
            <SignatureUploadField label="Reviewed By" file={signatureReviewedBy} onChange={setSignatureReviewedBy} />
            <SignatureUploadField label="Approved By" file={signatureApprovedBy} onChange={setSignatureApprovedBy} />
          </div>
        </FormSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <FormSection title="Admin Account" description="Full access to every feature by default.">
            <div className="space-y-3">
              <TextField required label="Admin Name" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField required label="Username" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} />
                <TextField
                  required
                  type="password"
                  label="Password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Admin feature access</label>
                <PermissionChecklist selected={adminPermissions} onChange={setAdminPermissions} />
              </div>
            </div>
          </FormSection>

          <FormSection title="Staff Account" description="Scoped access — Billing, Customer Registration, and Stock Data by default.">
            <div className="space-y-3">
              <TextField required label="Staff Name" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField required label="Username" value={staffUsername} onChange={(e) => setStaffUsername(e.target.value)} />
                <TextField
                  required
                  type="password"
                  label="Password"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Staff feature access</label>
                <PermissionChecklist selected={staffPermissions} onChange={setStaffPermissions} />
              </div>
            </div>
          </FormSection>
        </div>

        {error && <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div className="flex items-center gap-3 pb-6">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-60 text-slate-900 hover:text-white font-black py-3 rounded-lg shadow"
          >
            {submitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" /> Creating shop & loading medicine catalog...
              </span>
            ) : (
              "Create Shop"
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push("/superadmin")}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
