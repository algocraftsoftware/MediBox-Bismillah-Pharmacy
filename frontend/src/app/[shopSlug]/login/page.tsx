"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, authApi, session } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";

export default function ShopAdminLoginPage() {
  const router = useRouter();
  const params = useParams<{ shopSlug: string }>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authApi.shopAdminLogin(params.shopSlug, username, password);
      session.setShopAdmin(result);
      // Use the canonical (lowercase) slug the backend returns, not the raw
      // URL segment — they can differ in case if someone typed/pasted the
      // login URL with different casing, and staying consistent here avoids
      // a login->redirect loop against ShopSessionContext's exact-match check.
      router.push(`/${result.shop.slug}/billing`);
    } catch (err) {
      // A raw fetch/network failure (server unreachable, offline, etc.)
      // throws a TypeError with an unhelpful browser message like "Failed
      // to fetch" — only an ApiError carries an actual backend response
      // (wrong username/password and the like), so only that one is safe
      // to show verbatim.
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#f8fafc] font-sans">
      <div className="w-full max-w-sm bg-white border border-slate-300 rounded-xl p-8 shadow-lg">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="bg-[#ADEBB3] text-slate-900 px-4 py-2 rounded font-black text-lg tracking-wide">
            MediBox
          </div>
          <h1 className="text-base font-black text-slate-900">Pharmacy Staff Login</h1>
          <p className="text-xs text-slate-500 font-semibold">/{params.shopSlug}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Username</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm font-semibold focus:border-[#ADEBB3] outline-none normal-case"
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
