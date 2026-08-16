"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Pencil, X } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { SettingsAccount } from "../../services/shopApi/core";
import { DashboardTabBar } from "./DashboardTabBar";

export const AsterSettingsView: React.FC = () => {
  const { shopSlug, token } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [accounts, setAccounts] = useState<SettingsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listSettingsAccounts()
      .then(setAccounts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load accounts"))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
      <DashboardTabBar activeRoute="settings" />
      <div className="p-6 space-y-5 max-w-3xl mx-auto w-full select-none overflow-y-auto flex-1">
        <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-700" />
            Settings
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Change the login username and/or password for your own account or any staff account in this shop.
          </p>
        </div>

        {error && <p className="text-red-600 font-bold text-sm">{error}</p>}
        {loading && (
          <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
            <Spinner size="xs" /> Loading...
          </div>
        )}

        {!loading && (
          <div className="space-y-2.5">
            {accounts.map((account) => (
              <AccountRow key={account.id} api={api} account={account} onUpdated={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AccountRow: React.FC<{
  api: ReturnType<typeof shopApi>;
  account: SettingsAccount;
  onUpdated: () => void;
}> = ({ api, account, onUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const resetForm = () => {
    setUsername(account.username);
    setPassword("");
    setConfirmPassword("");
    setPasswordTouched(false);
    setShowPassword(false);
    setRowError(null);
  };

  const handleSave = async () => {
    if (!username.trim()) {
      setRowError("Username is required");
      return;
    }
    if (passwordTouched && password && password !== confirmPassword) {
      setRowError("Password and Confirm Password do not match");
      return;
    }
    setSaving(true);
    setRowError(null);
    try {
      const updated = await api.updateSettingsAccount(account.id, {
        username: username.trim() !== account.username ? username.trim() : undefined,
        password: passwordTouched && password ? password : undefined,
      });
      // Reset from the fresh API response, not the (still-stale-until-the
      // parent's refetch lands) `account` prop, so re-opening Edit right
      // after saving shows the just-saved username, not the old one.
      setUsername(updated.username);
      setPassword("");
      setConfirmPassword("");
      setPasswordTouched(false);
      setShowPassword(false);
      setEditing(false);
      onUpdated();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Could not update account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{account.name}</span>
            <span
              className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                account.role === "ADMIN" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {account.role}
            </span>
            {account.status === "INACTIVE" && (
              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                Inactive
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 font-semibold">@{account.username}</span>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-semibold normal-case"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">New Password (leave blank to keep)</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordTouched(true);
                }}
                autoComplete="new-password"
                className="w-full border border-slate-300 rounded px-3 py-2 pr-9 text-sm font-semibold"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {passwordTouched && password && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">Confirm Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full border border-slate-300 rounded px-3 py-2 pr-9 text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          {rowError && <p className="text-xs font-bold text-red-600">{rowError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 bg-[#047857] hover:bg-[#065f46] disabled:opacity-50 text-white font-bold text-xs px-3 py-1.5 rounded"
            >
              {saving ? <Spinner size="xs" variant="white" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                resetForm();
              }}
              className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
