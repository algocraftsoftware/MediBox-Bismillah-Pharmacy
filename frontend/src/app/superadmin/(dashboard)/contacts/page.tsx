"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Phone, Search, Users } from "lucide-react";
import { session, superAdminApi } from "../../../../services/api";
import { ApiError } from "../../../../services/shopApi/http";
import { ContactSummary, ShopSummary } from "../../../../types";
import { Spinner } from "../../../../components/Spinner";

const PAGE_SIZE = 50;

// Every patient registered by any shop, as name and mobile only.
//
// The list is deliberately narrow: the shops' staff enter far more than this
// when they register someone, and none of the rest — address, NID, passport,
// email, purchase history, outstanding balance — belongs in a cross-shop view.
// The server enforces that; this screen simply has nothing else to show.
export default function ContactsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [shops, setShops] = useState<ShopSummary[]>([]);

  const [rows, setRows] = useState<ContactSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // `search` is what the user is typing; `applied` is what the list and the
  // download are actually filtered by, so both always agree.
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [shopId, setShopId] = useState("");

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both effects hand their state updates to a timer rather than setting them
  // straight from the effect body: setting state synchronously there cascades
  // an extra render, and for the loader it also coalesces the burst of updates
  // that filter changes produce into a single fetch.
  useEffect(() => {
    const sess = session.getSuperAdmin();
    if (!sess) {
      router.replace("/superadmin/login");
      return;
    }
    const t = setTimeout(() => {
      setToken(sess.token);
      superAdminApi
        .listShops(sess.token)
        .then(setShops)
        .catch(() => setShops([]));
    }, 0);
    return () => clearTimeout(t);
  }, [router]);

  const load = useCallback(
    (targetPage: number, term: string, shop: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      superAdminApi
        .listContacts(token, { search: term, shopId: shop || undefined, page: targetPage, pageSize: PAGE_SIZE })
        .then((res) => {
          setRows(res.rows);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the contact list"))
        .finally(() => setLoading(false));
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => load(1, applied, shopId), 0);
    return () => clearTimeout(t);
  }, [token, applied, shopId, load]);

  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    setError(null);
    try {
      await superAdminApi.exportContacts(token, { search: applied, shopId: shopId || undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not download the contact list");
    } finally {
      setDownloading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-700" />
            Contact List
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Patients registered across every shop — name and mobile number only.
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || total === 0}
          className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold text-sm px-4 py-2.5 rounded-lg inline-flex items-center gap-2"
          title={total === 0 ? "Nothing to download" : "Download every contact matching the current filters"}
        >
          {downloading ? <Spinner size="xs" variant="white" /> : <Download className="w-4 h-4" />}
          {downloading ? "Preparing..." : "Download Excel"}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-56">
          <label className="font-bold text-slate-700 block mb-1 text-xs">Search</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search.trim())}
              placeholder="Name or mobile number..."
              className="w-full border border-slate-300 rounded pl-8 pr-2 py-2 text-sm font-semibold"
            />
          </div>
        </div>
        <div className="w-64">
          <label className="font-bold text-slate-700 block mb-1 text-xs">Shop</label>
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-2 text-sm font-semibold"
          >
            <option value="">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setApplied(search.trim())}
          className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm px-5 py-2 rounded"
        >
          Search
        </button>
        {(applied || shopId) && (
          <button
            onClick={() => {
              setSearch("");
              setApplied("");
              setShopId("");
            }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-red-600 font-bold text-sm">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <span className="font-black text-slate-700 text-sm uppercase">
            {total.toLocaleString()} contact{total === 1 ? "" : "s"}
          </span>
          {loading && <Spinner size="xs" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-black uppercase text-xs whitespace-nowrap">
                <th className="py-3 px-4 border-b border-slate-200 w-16">#</th>
                <th className="py-3 px-4 border-b border-slate-200">Name</th>
                <th className="py-3 px-4 border-b border-slate-200">Mobile</th>
                <th className="py-3 px-4 border-b border-slate-200">Shop</th>
              </tr>
            </thead>
            <tbody className="font-semibold">
              {rows.map((c, i) => (
                <tr key={c.id} className="odd:bg-white even:bg-slate-50/60">
                  <td className="py-2.5 px-4 text-slate-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="py-2.5 px-4 text-slate-800 font-bold">{c.name}</td>
                  <td className="py-2.5 px-4 text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {c.mobile}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{c.shop?.name || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="py-14 text-center text-slate-400 font-bold">
                    {applied || shopId ? "No contact matches those filters." : "No patients have been registered yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-slate-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1, applied, shopId)}
                className="px-3.5 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => load(page + 1, applied, shopId)}
                className="px-3.5 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
