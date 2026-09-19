"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, ShieldCheck } from "lucide-react";
import { session, superAdminApi, ApiError } from "../../../../../../services/api";
import { ShopAdminAccount, Store } from "../../../../../../types";
import { Spinner } from "../../../../../../components/Spinner";
import { DEFAULT_STAFF_PERMISSIONS } from "../../../../../../lib/menuFeatures";
import { ShopLogoBadge } from "../../../../../../components/admin/ShopLogoBadge";
import { FormSection } from "../../../../../../components/superadmin/FormSection";
import { TextField } from "../../../../../../components/superadmin/TextField";
import { PermissionChecklist } from "../../../../../../components/superadmin/PermissionChecklist";
import { SignatureUploadField } from "../../../../../../components/superadmin/SignatureUploadField";
import { SlugInput } from "../../../../../../components/superadmin/SlugInput";

export default function EditShopPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const shopId = Number(params.id);

  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "SUSPENDED">("ACTIVE");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [signaturePreparedBy, setSignaturePreparedBy] = useState<File | null>(null);
  const [signatureReviewedBy, setSignatureReviewedBy] = useState<File | null>(null);
  const [signatureApprovedBy, setSignatureApprovedBy] = useState<File | null>(null);
  const [currentPreparedBySignatureUrl, setCurrentPreparedBySignatureUrl] = useState<string | null>(null);
  const [currentReviewedBySignatureUrl, setCurrentReviewedBySignatureUrl] = useState<string | null>(null);
  const [currentApprovedBySignatureUrl, setCurrentApprovedBySignatureUrl] = useState<string | null>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");
  const [addingBranch, setAddingBranch] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [adminName, setAdminName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordTouched, setAdminPasswordTouched] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);

  const [staffAccounts, setStaffAccounts] = useState<ShopAdminAccount[]>([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffUsername, setNewStaffUsername] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffPermissions, setNewStaffPermissions] = useState<string[]>(DEFAULT_STAFF_PERMISSIONS);
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

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

  const load = (t: string) => {
    setLoadError(null);
    superAdminApi
      .getShop(t, shopId)
      .then((data) => {
        const admin = data.admins.find((a) => a.role === "ADMIN");
        setCode(data.code);
        setName(data.name);
        setSlug(data.slug);
        setStatus(data.status);
        setAddress(data.address ?? "");
        setPhone(data.phone ?? "");
        setCurrentLogoUrl(data.logoUrl);
        setCurrentPreparedBySignatureUrl(data.preparedBySignatureUrl);
        setCurrentReviewedBySignatureUrl(data.reviewedBySignatureUrl);
        setCurrentApprovedBySignatureUrl(data.approvedBySignatureUrl);
        setAdminName(admin?.name ?? "");
        setAdminUsername(admin?.username ?? "");
        setAdminPermissions(admin?.permissions ?? []);
        setStaffAccounts(data.admins.filter((a) => a.role === "STAFF"));
        setStores(data.stores);
        setLoaded(true);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load shop"));
  };

  useEffect(() => {
    if (token) load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, shopId]);

  if (!token) return null;

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) {
      setBranchError("Branch name is required");
      return;
    }
    setAddingBranch(true);
    setBranchError(null);
    try {
      const created = await superAdminApi.addShopBranch(token, shopId, {
        name: newBranchName.trim(),
        address: newBranchAddress.trim() || undefined,
        phone: newBranchPhone.trim() || undefined,
      });
      setStores((prev) => [...prev, created]);
      setNewBranchName("");
      setNewBranchAddress("");
      setNewBranchPhone("");
    } catch (err) {
      setBranchError(err instanceof ApiError ? err.message : "Could not add branch");
    } finally {
      setAddingBranch(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaffName.trim() || !newStaffUsername.trim() || !newStaffPassword) {
      setStaffError("Name, username, and password are required");
      return;
    }
    setAddingStaff(true);
    setStaffError(null);
    try {
      const created = await superAdminApi.createStaff(token, shopId, {
        name: newStaffName.trim(),
        username: newStaffUsername.trim(),
        password: newStaffPassword,
        permissions: newStaffPermissions,
      });
      setStaffAccounts((prev) => [...prev, created]);
      setShowAddStaff(false);
      setNewStaffName("");
      setNewStaffUsername("");
      setNewStaffPassword("");
      setNewStaffPermissions(DEFAULT_STAFF_PERMISSIONS);
    } catch (err) {
      setStaffError(err instanceof ApiError ? err.message : "Could not add staff account");
    } finally {
      setAddingStaff(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await superAdminApi.updateShop(token, shopId, {
        code,
        name,
        slug,
        status,
        address,
        phone,
        adminName: adminName || undefined,
        adminUsername: adminUsername || undefined,
        adminPassword: adminPasswordTouched && adminPassword ? adminPassword : undefined,
        adminPermissions,
        logo,
        signaturePreparedBy,
        signatureReviewedBy,
        signatureApprovedBy,
      });
      router.push("/superadmin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update shop");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3">
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
          <span className="font-black text-base">Edit Shop{name ? ` — ${name}` : ""}</span>
        </div>
      </div>

      {!loaded ? (
        loadError ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
            <p className="text-sm font-bold text-red-600">{loadError}</p>
            <button
              type="button"
              onClick={() => load(token)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Spinner size="lg" />
            <p className="text-slate-500 font-semibold text-sm">Loading...</p>
          </div>
        )
      ) : (
        <form onSubmit={handleSubmit} className="text-sm space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <FormSection title="Shop Details">
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField required label="Shop ID" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                  <TextField required label="Shop Name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Login URL Slug</label>
                  <SlugInput value={slug} onChange={setSlug} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Shop Address" hint="optional" value={address} onChange={(e) => setAddress(e.target.value)} />
                  <TextField label="Shop Phone" hint="optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "ACTIVE" | "SUSPENDED")}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-2 font-semibold text-slate-900 normal-case"
                  >
                    <option value="ACTIVE">Published (Active)</option>
                    <option value="SUSPENDED">Unpublished (Suspended)</option>
                  </select>
                </div>
              </div>
            </FormSection>

            <FormSection title="Shop Logo" description="Shown in the header and menu.">
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
                      className="w-10 h-10 rounded object-cover border border-slate-200"
                    />
                    <span className="text-xs text-slate-500 font-semibold">New logo selected — will be uploaded</span>
                  </div>
                ) : currentLogoUrl ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={currentLogoUrl} alt="Current logo" className="w-10 h-10 rounded object-cover border border-slate-200" />
                    <span className="text-xs text-slate-500 font-semibold">Current logo (kept if none selected)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <ShopLogoBadge name={name} logoUrl={null} />
                    <span className="text-xs text-slate-500 font-semibold">No logo — shop name shown in white badge</span>
                  </div>
                )}
              </div>
            </FormSection>
          </div>

          <FormSection
            title="Sign-Off Signatures"
            description="Stamped onto printed documents (e.g. Purchase Order) that reserve these signature slots."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SignatureUploadField
                label="Prepared By"
                file={signaturePreparedBy}
                onChange={setSignaturePreparedBy}
                currentUrl={currentPreparedBySignatureUrl}
              />
              <SignatureUploadField
                label="Reviewed By"
                file={signatureReviewedBy}
                onChange={setSignatureReviewedBy}
                currentUrl={currentReviewedBySignatureUrl}
              />
              <SignatureUploadField
                label="Approved By"
                file={signatureApprovedBy}
                onChange={setSignatureApprovedBy}
                currentUrl={currentApprovedBySignatureUrl}
              />
            </div>
          </FormSection>

          <FormSection title="Branches">
            <div className="space-y-1.5 mb-3">
              {stores.length === 0 ? (
                <p className="text-xs text-slate-500 font-semibold">No branches yet.</p>
              ) : (
                stores.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-3 py-1.5"
                  >
                    <span className="font-bold text-slate-800">{s.name}</span>
                    <span className="text-[11px] text-slate-500 font-semibold">{s.code}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-1.5">
              <input
                placeholder="New branch name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="flex-1 bg-white border border-slate-300 rounded px-3 py-2 font-semibold text-slate-900 normal-case"
              />
              <button
                type="button"
                onClick={handleAddBranch}
                disabled={addingBranch}
                className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-3 rounded shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {addingBranch ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Spinner size="xs" variant="white" /> Adding...
                  </span>
                ) : (
                  "Add"
                )}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <input
                placeholder="Address (optional)"
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                className="bg-white border border-slate-300 rounded px-3 py-2 font-semibold text-slate-900 normal-case"
              />
              <input
                placeholder="Phone (optional)"
                value={newBranchPhone}
                onChange={(e) => setNewBranchPhone(e.target.value)}
                className="bg-white border border-slate-300 rounded px-3 py-2 font-semibold text-slate-900 normal-case"
              />
            </div>
            {branchError && <p className="text-xs font-bold text-red-600 mt-1.5">{branchError}</p>}
          </FormSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <FormSection title="Admin Account">
              <div className="space-y-3">
                <TextField label="Admin Name" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Username" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} />
                  <TextField
                    type="password"
                    label="Password"
                    hint="leave blank to keep"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setAdminPasswordTouched(true);
                    }}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Admin feature access</label>
                  <PermissionChecklist selected={adminPermissions} onChange={setAdminPermissions} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Staff Accounts" description="Scoped access — add as many as this shop needs.">
              <div className="space-y-2">
                {staffAccounts.length === 0 ? (
                  <p className="text-xs text-slate-500 font-semibold">No staff accounts yet.</p>
                ) : (
                  staffAccounts.map((s) => (
                    <StaffAccountRow
                      key={s.id}
                      token={token}
                      shopId={shopId}
                      staff={s}
                      onUpdated={(updated) =>
                        setStaffAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
                      }
                    />
                  ))
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200">
                {!showAddStaff ? (
                  <button
                    type="button"
                    onClick={() => setShowAddStaff(true)}
                    className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2.5 py-1.5 rounded"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Staff Account
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <TextField label="Staff Name" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <TextField
                        label="Username"
                        value={newStaffUsername}
                        onChange={(e) => setNewStaffUsername(e.target.value)}
                      />
                      <TextField
                        type="password"
                        label="Password"
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Staff feature access</label>
                      <PermissionChecklist selected={newStaffPermissions} onChange={setNewStaffPermissions} />
                    </div>
                    {staffError && <p className="text-xs font-bold text-red-600">{staffError}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddStaff}
                        disabled={addingStaff}
                        className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs px-3 py-1.5 rounded"
                      >
                        {addingStaff ? (
                          <span className="inline-flex items-center justify-center gap-2">
                            <Spinner size="xs" variant="white" /> Adding...
                          </span>
                        ) : (
                          "Add Staff Account"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddStaff(false);
                          setNewStaffName("");
                          setNewStaffUsername("");
                          setNewStaffPassword("");
                          setNewStaffPermissions(DEFAULT_STAFF_PERMISSIONS);
                          setStaffError(null);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
                  <Spinner size="xs" /> Saving...
                </span>
              ) : (
                "Save Changes"
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
      )}
    </div>
  );
}

function StaffAccountRow({
  token,
  shopId,
  staff,
  onUpdated,
}: {
  token: string;
  shopId: number;
  staff: ShopAdminAccount;
  onUpdated: (updated: ShopAdminAccount) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(staff.name);
  const [username, setUsername] = useState(staff.username);
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [permissions, setPermissions] = useState<string[]>(staff.permissions);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setRowError(null);
    try {
      const updated = await superAdminApi.updateStaff(token, shopId, staff.id, {
        name: name || undefined,
        username: username || undefined,
        password: passwordTouched && password ? password : undefined,
        permissions,
      });
      onUpdated(updated);
      setEditing(false);
      setPassword("");
      setPasswordTouched(false);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Could not update staff account");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    setTogglingStatus(true);
    setRowError(null);
    try {
      const updated = await superAdminApi.toggleStaffStatus(token, shopId, staff.id);
      onUpdated(updated);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Could not update status");
    } finally {
      setTogglingStatus(false);
    }
  };

  if (!editing) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">{staff.name}</span>
              <span
                className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                  staff.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                }`}
              >
                {staff.status}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-semibold">@{staff.username}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2 py-1 rounded"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={togglingStatus}
              className={`text-xs font-bold px-2 py-1 rounded disabled:opacity-50 ${
                staff.status === "ACTIVE"
                  ? "text-red-600 bg-white border border-red-200 hover:bg-red-50"
                  : "text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              {togglingStatus ? "..." : staff.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>
        {rowError && <p className="text-[11px] font-bold text-red-600 mt-1.5">{rowError}</p>}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-3 space-y-2.5">
      <TextField label="Staff Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <TextField
          type="password"
          label="Password"
          hint="leave blank to keep"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordTouched(true);
          }}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Staff feature access</label>
        <PermissionChecklist selected={permissions} onChange={setPermissions} />
      </div>
      {rowError && <p className="text-[11px] font-bold text-red-600">{rowError}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs px-3 py-1.5 rounded"
        >
          {saving ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner size="xs" variant="white" /> Saving...
            </span>
          ) : (
            "Save"
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(staff.name);
            setUsername(staff.username);
            setPassword("");
            setPasswordTouched(false);
            setPermissions(staff.permissions);
            setRowError(null);
          }}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
