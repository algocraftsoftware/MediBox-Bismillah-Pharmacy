"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Store as StoreIcon, Users, TrendingUp, X, Pill, Pencil, Trash2, Search, Calendar, DollarSign, Wallet, Info } from "lucide-react";
import { session, superAdminApi } from "../../../services/api";
import { ShopSummary, PlatformStats } from "../../../types";
import { ShopSalesModal } from "../../../components/superadmin/ShopSalesModal";

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function SuperAdminDashboardPage() {
  return (
    <Suspense fallback={null}>
      <SuperAdminDashboard />
    </Suspense>
  );
}

function SuperAdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [salesModalShop, setSalesModalShop] = useState<ShopSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingShops, setLoadingShops] = useState(true);
  const toast = searchParams.get("toast");
  const [searchId, setSearchId] = useState("");
  const [from, setFrom] = useState(toInputDate(new Date(new Date().setDate(1))));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [showFilter, setShowFilter] = useState(false);

  const visibleShops = searchId.trim()
    ? shops.filter((s) => s.code.toLowerCase().includes(searchId.trim().toLowerCase()))
    : shops;

  useEffect(() => {
    const sess = session.getSuperAdmin();
    if (!sess) {
      router.replace("/superadmin/login");
      return;
    }
    setToken(sess.token);
  }, [router]);

  // Clean the one-shot toast param out of the URL bar after reading it, so a
  // manual refresh doesn't keep re-showing it.
  useEffect(() => {
    if (searchParams.get("toast")) {
      window.history.replaceState(null, "", "/superadmin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = (t: string) => {
    setLoadingShops(true);
    setError(null);
    superAdminApi
      .listShops(t)
      .then(setShops)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingShops(false));
    superAdminApi
      .getPlatformStats(t, { from, to })
      .then(setPlatformStats)
      .catch(() => {
        // Non-critical (the shop cards below carry the important data) — a
        // failed stats fetch shouldn't block or blank out the rest of the page.
      });
  };

  useEffect(() => {
    if (token) refresh(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, from, to]);

  if (!token) return null;

  return (
    <>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black">Pharmacy Shops</h1>
            <p className="text-sm text-slate-500 font-semibold">Enroll shops, set their admin login, and monitor sales</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Search by Shop ID..."
                className="pl-9 pr-3 py-2.5 border border-slate-300 rounded bg-white font-semibold text-sm w-56 normal-case"
              />
            </div>
            <button
              onClick={() => setShowFilter(true)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded px-4 py-2.5 font-bold text-sm shadow-sm"
            >
              <Calendar className="w-4 h-4" />
              {from} — {to}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm font-bold text-red-600 flex-1">{error}</p>
            <button
              onClick={() => refresh(token)}
              className="bg-white border border-red-300 hover:bg-red-100 text-red-700 font-bold text-xs px-3 py-1.5 rounded shrink-0"
            >
              Retry
            </button>
          </div>
        )}
        {toast && <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{toast}</p>}

        {platformStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <StoreIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Shops</div>
                <div className="text-lg font-black">{platformStats.shopCount}</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Pill className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Products</div>
                <div className="text-lg font-black">{platformStats.productCount.toLocaleString()}</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Batches</div>
                <div className="text-lg font-black">{platformStats.batchCount.toLocaleString()}</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Total Sales</div>
                <div className="text-lg font-black">৳{(platformStats.sales?.total ?? 0).toLocaleString()}</div>
                <div className="text-[10px] font-bold text-slate-500 mt-0.5">Invoice: {platformStats.sales?.invoiceCount ?? 0}</div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Collection</div>
                <div className="text-lg font-black">৳{(platformStats.collection?.total ?? 0).toLocaleString()}</div>
                <div className="text-[10px] font-bold text-slate-500 flex flex-col mt-0.5">
                  <span>Cash: ৳{(platformStats.collection?.cash ?? 0).toLocaleString()}</span>
                  <span>Mobile: ৳{(platformStats.collection?.mobile ?? 0).toLocaleString()}</span>
                  <span>Card: ৳{(platformStats.collection?.card ?? 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {loadingShops ? (
          <div className="text-center py-16 text-slate-400 font-bold">Loading shops...</div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleShops.map((shop) => (
            <div key={shop.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-3">
                {shop.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shop.logoUrl} alt={shop.name} className="w-10 h-10 rounded object-cover bg-white" />
                ) : (
                  <div className="w-10 h-10 rounded bg-[#ADEBB3] flex items-center justify-center font-black text-slate-900">
                    {shop.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="font-black">{shop.name}</div>
                  <div className="text-xs text-slate-500 font-semibold">/{shop.slug}/login</div>
                </div>
                <span
                  className={`ml-auto text-[10px] font-black px-2 py-1 rounded ${
                    shop.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                  }`}
                >
                  {shop.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span className="bg-slate-100 rounded px-2 py-1">ID: {shop.code}</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Activated {new Date(shop.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold">
                <div className="bg-slate-100 rounded py-2">
                  <StoreIcon className="w-3.5 h-3.5 mx-auto mb-1 text-slate-500" />
                  {shop.storeCount} Stores
                </div>
                <div className="bg-slate-100 rounded py-2">
                  <Users className="w-3.5 h-3.5 mx-auto mb-1 text-slate-500" />
                  {shop.adminCount} Admins
                </div>
                <div className="bg-slate-100 rounded py-2">
                  <Pill className="w-3.5 h-3.5 mx-auto mb-1 text-slate-500" />
                  {shop.productCount} Meds
                </div>
                <div className="bg-slate-100 rounded py-2">
                  <TrendingUp className="w-3.5 h-3.5 mx-auto mb-1 text-slate-500" />
                  ৳{shop.totalSales.toFixed(0)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => router.push(`/superadmin/shops/${shop.id}/edit`)}
                  className="flex-1 bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold text-xs py-2 rounded flex items-center justify-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={() => setSalesModalShop(shop)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 rounded flex items-center justify-center gap-1"
                >
                  <Info className="w-3 h-3" />
                  Details
                </button>
                <button
                  onClick={async () => {
                    await superAdminApi.toggleShopStatus(token, shop.id);
                    refresh(token);
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 rounded"
                >
                  {shop.status === "ACTIVE" ? "Unpublish" : "Publish"}
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Delete "${shop.name}" and ALL of its data? This cannot be undone.`)) return;
                    await superAdminApi.deleteShop(token, shop.id);
                    refresh(token);
                  }}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs py-2 rounded flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          ))}

          {shops.length === 0 && !error && (
            <div className="col-span-full text-center py-16 text-slate-400 font-bold">
              No shops enrolled yet. Click "Enroll New Shop" to add one.
            </div>
          )}
        </div>
        )}
      </div>

      {showFilter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-sm w-full shadow-2xl">
            <div className="bg-[#1e40af] text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <span className="font-bold">Filter by Date</span>
              <button onClick={() => setShowFilter(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
                  />
                </div>
              </div>
              <button
                onClick={() => setShowFilter(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {salesModalShop && (
        <ShopSalesModal token={token} shop={salesModalShop} onClose={() => setSalesModalShop(null)} />
      )}
    </>
  );
}
