"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ApiError, authApi, session } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authApi.superAdminLogin(email, password);
      session.setSuperAdmin(result);
      // A hard navigation, not router.push — guarantees the dashboard page
      // mounts fresh and reads the just-written session from localStorage,
      // instead of any client-side route transition potentially reusing a
      // cached pre-login render of /superadmin.
      window.location.href = "/superadmin";
    } catch (err) {
      // A raw fetch/network failure (server unreachable, offline, etc.)
      // throws a TypeError with an unhelpful browser message like "Failed
      // to fetch" — only an ApiError carries an actual backend response
      // (wrong email/password and the like), so only that one is safe to
      // show verbatim.
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#f8fafc] font-sans">
      <div className="w-full max-w-sm bg-white border border-slate-300 rounded-xl p-8 shadow-lg">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-lg bg-[#ADEBB3] flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-base font-black text-slate-900">MediBox Platform — Super Admin</h1>
          <p className="text-xs text-slate-500 font-semibold">Enroll and manage pharmacy shops</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm font-semibold focus:border-[#ADEBB3] outline-none normal-case"
              placeholder="super@medibox.app"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm font-semibold focus:border-[#ADEBB3] outline-none normal-case"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs font-bold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-60 text-slate-900 hover:text-white font-black py-2.5 rounded shadow"
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="xs" /> Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
