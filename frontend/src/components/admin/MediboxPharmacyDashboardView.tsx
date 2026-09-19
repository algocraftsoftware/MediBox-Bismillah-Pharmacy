"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calendar, ChevronRight, CreditCard, FileEdit, Smartphone, TrendingUp, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useRouter, useSearchParams } from "next/navigation";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { DashboardResponse } from "../../types";
import { MOBILE_BANKING_TYPES } from "../../lib/bdPaymentOptions";
import { Spinner } from "../Spinner";
import { MediboxInvoiceListView } from "./MediboxInvoiceListView";
import { DashboardTabBar } from "./DashboardTabBar";

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const fmt = (n: number) => (Number(n || 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
const fmtInt = (n: number) => Number(n || 0).toLocaleString();

// Shown when the request never reached the API at all (offline, the backend
// not running, a cold start timing out) — as opposed to an ApiError, which
// carries the server's own message and is shown verbatim instead.
const REACH_ERROR = "Couldn't reach the server — showing the last figures loaded.";

// Pharma and Non-Pharma get fixed colours so the category donut reads the same
// every time; any other department a shop has created cycles through the rest of
// the palette rather than colliding.
const CATEGORY_COLORS: Record<string, string> = { Pharma: "#047857", "Non-Pharma": "#f59e0b" };
const CATEGORY_FALLBACK = ["#2563eb", "#7c3aed", "#db2777", "#0891b2"];

export const MediboxPharmacyDashboardView: React.FC = () => {
  const { shopSlug, token, stores, selectedStoreId, setSelectedStoreId, permissions } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);
  const searchParams = useSearchParams();
  const router = useRouter();
  // Shown only when GRN With PO has actually been granted. There used to be an
  // `adminRole === "ADMIN"` bypass here, matching the ones MediboxHeader and
  // DashboardTabBar carried; those were removed so that restricting a feature
  // from the Super Admin dashboard genuinely restricts it, and this card
  // follows the same rule rather than re-opening a hidden route.
  const canEditGrnWithPo = permissions.includes("grn-with-po");

  // Lets DashboardTabBar's Collection/Due Collection buttons deep-link here
  // with the right tab pre-selected when navigating in from another page
  // (e.g. Employees) instead of always landing on Collection.
  const [tab, setTab] = useState<"collection" | "due">(searchParams.get("tab") === "due" ? "due" : "collection");

  // Collection and Profit each keep their own independent date range — a
  // shop admin might want "today's collection" next to "this month's
  // profit" — so each card gets its own filter state, its own fetch, and
  // its own copy of the Filter-by-Date dialog (driven by `showFilter`).
  const [showFilter, setShowFilter] = useState<"collection" | "profit" | null>(null);
  const [showMobileBreakdown, setShowMobileBreakdown] = useState(false);
  const [showCardBreakdown, setShowCardBreakdown] = useState(false);
  const [collectionFrom, setCollectionFrom] = useState(toInputDate(new Date()));
  const [collectionTo, setCollectionTo] = useState(toInputDate(new Date()));
  const [profitFrom, setProfitFrom] = useState(toInputDate(new Date()));
  const [profitTo, setProfitTo] = useState(toInputDate(new Date()));
  const [collectionData, setCollectionData] = useState<DashboardResponse | null>(null);
  const [profitData, setProfitData] = useState<DashboardResponse | null>(null);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [loadingProfit, setLoadingProfit] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Both loaders swallow their own failure into `loadError`. Without a catch a
  // dropped request became an unhandled rejection, which in dev throws the
  // Next.js error overlay over the whole page and in production left the cards
  // stuck on stale numbers with no hint anything was wrong. The dashboard also
  // polls on a timer and on tab focus, so a single blip must not take it down —
  // it keeps the figures it already has and says the refresh failed.
  const loadCollection = useCallback(() => {
    setLoadingCollection(true);
    api
      .getDashboard({ storeId: selectedStoreId ?? undefined, from: collectionFrom, to: collectionTo })
      .then((d) => {
        setCollectionData(d);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : REACH_ERROR))
      .finally(() => setLoadingCollection(false));
  }, [api, selectedStoreId, collectionFrom, collectionTo]);

  const loadProfit = useCallback(() => {
    setLoadingProfit(true);
    api
      .getDashboard({ storeId: selectedStoreId ?? undefined, from: profitFrom, to: profitTo })
      .then((d) => {
        setProfitData(d);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : REACH_ERROR))
      .finally(() => setLoadingProfit(false));
  }, [api, selectedStoreId, profitFrom, profitTo]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  useEffect(() => {
    loadProfit();
  }, [loadProfit]);

  // Keeps both cards current without needing a manual refresh: an in-page
  // Billing submission (or a due-payment receipt) broadcasts this event, the
  // tab regaining focus re-checks in case a sale happened elsewhere, and the
  // interval is a safety net for whichever of those two doesn't fire.
  useEffect(() => {
    const loadBoth = () => {
      loadCollection();
      loadProfit();
    };
    const handleFocus = () => {
      if (document.visibilityState === "visible") loadBoth();
    };
    window.addEventListener("medibox:sale-created", loadBoth);
    document.addEventListener("visibilitychange", handleFocus);
    window.addEventListener("focus", loadBoth);
    const interval = window.setInterval(loadBoth, 20000);
    return () => {
      window.removeEventListener("medibox:sale-created", loadBoth);
      document.removeEventListener("visibilitychange", handleFocus);
      window.removeEventListener("focus", loadBoth);
      window.clearInterval(interval);
    };
  }, [loadCollection, loadProfit]);

  // Merge the actual per-provider sums against the full known provider list so
  // the breakdown always shows every provider (at ৳0.00 if unused this
  // period) in a stable order, with any legacy/unrecognized type appended.
  const mobileBreakdownRows = useMemo(() => {
    const byType = collectionData?.collection.mobileByType ?? [];
    const amountByType = new Map(byType.map((r) => [r.type, r.amount]));
    const rows = MOBILE_BANKING_TYPES.map((type) => ({ type, amount: amountByType.get(type) ?? 0 }));
    byType.forEach((r) => {
      if (!MOBILE_BANKING_TYPES.includes(r.type)) rows.push(r);
    });
    return rows;
  }, [collectionData]);

  // Card breakdown intentionally shows only the card types actually used —
  // 3 sales paid by 3 different card types shows exactly those 3 rows, not
  // every known card type padded with zeros like the mobile breakdown above.
  const cardBreakdownRows = collectionData?.collection.cardByType ?? [];

  // Payment method split (Cash / Card / Mobile Banking) for the donut chart
  // below — driven by the same live collectionData as the Collection card
  // above, so it updates on the same date-range filter and auto-refresh
  // triggers (sale created, tab refocus, 20s poll) without a separate fetch.
  const paymentSplit = useMemo(() => {
    const cash = collectionData?.collection.cash ?? 0;
    const card = collectionData?.collection.card ?? 0;
    const mobile = collectionData?.collection.mobile ?? 0;
    const total = cash + card + mobile;
    return [
      { name: "Cash", value: cash, color: "#047857" },
      { name: "Card", value: card, color: "#2563eb" },
      { name: "Mobile Banking", value: mobile, color: "#7c3aed" },
    ].map((d) => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }));
  }, [collectionData]);
  const paymentTotal = paymentSplit.reduce((a, d) => a + d.value, 0);

  // Share of sales taken by each department, over the same period as the
  // headline figures — answers "what is actually selling", which the money
  // totals alone can't.
  const categorySplit = useMemo(() => {
    const rows = collectionData?.categorySplit ?? [];
    const total = rows.reduce((a, r) => a + r.salesValue, 0);
    let fallbackIdx = 0;
    return rows.map((r) => ({
      name: r.departmentName,
      value: r.salesValue,
      qty: r.qty,
      color: CATEGORY_COLORS[r.departmentName] ?? CATEGORY_FALLBACK[fallbackIdx++ % CATEGORY_FALLBACK.length],
      pct: total > 0 ? (r.salesValue / total) * 100 : 0,
    }));
  }, [collectionData]);
  const categoryTotal = categorySplit.reduce((a, d) => a + d.value, 0);

  const filterFrom = showFilter === "profit" ? profitFrom : collectionFrom;
  const filterTo = showFilter === "profit" ? profitTo : collectionTo;
  const setFilterFrom = showFilter === "profit" ? setProfitFrom : setCollectionFrom;
  const setFilterTo = showFilter === "profit" ? setProfitTo : setCollectionTo;

  const applyPreset = (days: number | "today" | "month") => {
    const end = new Date();
    let start = new Date();
    if (days === "today") {
      start = new Date();
    } else if (days === "month") {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else {
      start.setDate(end.getDate() - days);
    }
    setFilterFrom(toInputDate(start));
    setFilterTo(toInputDate(end));
    setShowFilter(null);
  };

  const tabBar = <DashboardTabBar activeRoute="dashboard" collectionTab={tab} onCollectionTabChange={setTab} />;

  if (tab === "due") {
    return (
      <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
        {tabBar}
        <MediboxInvoiceListView dueOnly heightClassName="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
      {tabBar}
      <div className="p-6 space-y-6 max-w-6xl mx-auto w-full select-none overflow-y-auto flex-1">
      {stores.length > 1 && (
        <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-slate-700">Store</label>
            <select
              value={selectedStoreId ?? ""}
              onChange={(e) => setSelectedStoreId(Number(e.target.value))}
              className="bg-white border border-slate-300 rounded px-3 py-1.5 font-bold text-sm"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* At-a-glance figures. Every one of these already came back from
          /dashboard on each refresh but had nowhere to show: sales for the
          chosen range, the rolling today/month/year totals, and what the shop
          spent and paid out. Same collectionData as the cards below, so they
          all move together on a date change or auto-refresh. */}
      {loadError && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-4 py-2.5 text-sm font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
          <button
            onClick={() => {
              loadCollection();
              loadProfit();
            }}
            className="ml-auto shrink-0 bg-white hover:bg-amber-100 border border-amber-300 rounded px-3 py-1 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {canEditGrnWithPo && (
        <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-black text-slate-800">GRN With PO</h3>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Every GRN received against a Purchase Order — search any of them and edit any field.
            </p>
          </div>
          <button
            onClick={() => router.push(`/${shopSlug}/grn-with-po`)}
            className="flex items-center gap-1.5 bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-lg pl-4 pr-3 py-2.5 text-sm shadow-sm shrink-0"
          >
            <FileEdit className="w-4 h-4" />
            Edit GRN With PO
            <ChevronRight className="w-4 h-4 opacity-70" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-300 rounded-2xl p-10 shadow-sm space-y-6">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setShowFilter("collection")}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-4 py-2 font-bold text-sm"
            >
              <Calendar className="w-4 h-4" />
              {collectionFrom} — {collectionTo}
            </button>
            {loadingCollection && (
              <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
                <Spinner size="xs" /> Refreshing...
              </div>
            )}
          </div>
          <div className="flex items-center gap-8">
            <div>
              <span className="text-base font-black text-slate-500 block uppercase tracking-wide">Collection</span>
              <span className="text-6xl font-black text-slate-900 block mt-3">
                ৳{fmt(collectionData?.collection.total ?? 0)}
              </span>
              <div className="text-lg font-bold text-slate-500 mt-4 space-y-1.5">
                <div>Invoice: {fmtInt(collectionData?.collection.invoiceCount ?? 0)}</div>
                <div>Cash: ৳{fmt(collectionData?.collection.cash ?? 0)}</div>
                <button
                  type="button"
                  onClick={() => setShowMobileBreakdown(true)}
                  className="flex items-center gap-1 hover:text-blue-700"
                >
                  Mobile Banking: ৳{fmt(collectionData?.collection.mobile ?? 0)}
                  <Smartphone className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowCardBreakdown(true)}
                  className="flex items-center gap-1 hover:text-blue-700"
                >
                  Card: ৳{fmt(collectionData?.collection.card ?? 0)}
                  <CreditCard className="w-4 h-4" />
                </button>
                <div>Adjustment: ৳{fmt(collectionData?.collection.adjustment ?? 0)}</div>
                {/* Dues collected on this day, counted here rather than back on
                    the invoice's own date. Shows zero when none were taken. */}
                <div title="Payments received today against earlier invoices">
                  Due Collection: ৳{fmt(collectionData?.collection.dueCollection?.total ?? 0)}
                </div>
              </div>
            </div>
            <div className="w-28 h-28 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Wallet className="w-14 h-14" />
            </div>
          </div>
        </div>

        {/* Profit = net sales minus cost of goods sold (batch purchase price
            × qty actually sold), same convention as the Sales Report's
            Profit sub-reports — filtered by its own independent date range. */}
        <div className="bg-white border border-slate-300 rounded-2xl p-10 shadow-sm space-y-6">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setShowFilter("profit")}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-4 py-2 font-bold text-sm"
            >
              <Calendar className="w-4 h-4" />
              {profitFrom} — {profitTo}
            </button>
            {loadingProfit && (
              <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
                <Spinner size="xs" /> Refreshing...
              </div>
            )}
          </div>
          <div className="flex items-center gap-8">
            <div>
              <span className="text-base font-black text-slate-500 block uppercase tracking-wide">Profit</span>
              <span className="text-6xl font-black text-slate-900 block mt-3">৳{fmt(profitData?.profit.total ?? 0)}</span>
              <div className="text-lg font-bold text-slate-500 mt-4 space-y-1.5">
                <div>Sales: ৳{fmt(profitData?.profit.salesTotal ?? 0)}</div>
                <div>Purchase Cost: ৳{fmt(profitData?.profit.cogs ?? 0)}</div>
              </div>
            </div>
            <div className="w-28 h-28 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <TrendingUp className="w-14 h-14" />
            </div>
          </div>
        </div>

        {/* Payment method split — same date range + live data as the
            Collection card above (no separate fetch), so it stays in sync
            with every auto-refresh trigger that already updates Collection. */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-base font-black text-slate-500 uppercase tracking-wide">Payment Method Split</span>
            {loadingCollection && <Spinner size="xs" />}
          </div>
          <div className="text-xs font-semibold text-slate-400 mb-4">
            {collectionFrom} — {collectionTo}
          </div>
          {paymentTotal === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm font-bold text-slate-400 text-center px-4">
              No cash / card / mobile banking collections for the selected period.
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="w-36 h-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentSplit}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={2}
                      strokeWidth={0}
                      isAnimationActive
                    >
                      {paymentSplit.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`৳${fmt(Number(value) || 0)}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5">
                {paymentSplit.map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-bold text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-black text-slate-900 shrink-0">{d.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pharma vs Non-Pharma share of sales, driven by the same live
            collectionData as the Payment Method Split beside it, so both
            refresh on the same date filter and auto-refresh triggers. */}
        <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-base font-black text-slate-500 uppercase tracking-wide">Item Category Split</span>
            {loadingCollection && <Spinner size="xs" />}
          </div>
          <div className="text-xs font-semibold text-slate-400 mb-4">Pharma vs Non-Pharma, by sales value</div>
          {categoryTotal === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm font-bold text-slate-400 text-center px-4">
              No items sold in the selected period.
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="w-36 h-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySplit}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={2}
                      strokeWidth={0}
                      isAnimationActive
                    >
                      {categorySplit.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`৳${fmt(Number(value) || 0)}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2.5">
                {categorySplit.map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-bold text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="font-black text-slate-900">{d.pct.toFixed(1)}%</span>
                      <span className="block text-[11px] font-semibold text-slate-400">
                        ৳{fmt(d.value)} · {d.qty.toLocaleString()} pcs
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showFilter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-md w-full shadow-2xl">
            <div className="bg-[#1e40af] text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <span className="font-bold">Filter {showFilter === "profit" ? "Profit" : "Collection"} by Date</span>
              <button onClick={() => setShowFilter(null)} className="text-white/80 hover:text-white">
                ×
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  ["Today", "today"],
                  ["7 Days", 7],
                  ["10 Days", 10],
                  ["15 Days", 15],
                  ["1 Month", "month"],
                ].map(([label, val]) => (
                  <button
                    key={label as string}
                    onClick={() => applyPreset(val as any)}
                    className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-bold px-3 py-1.5 rounded text-xs"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="text-center text-xs text-slate-400 font-semibold">— Or Custom Date —</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">End Date</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
                  />
                </div>
              </div>
              <button
                onClick={() => setShowFilter(null)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-md w-full shadow-2xl">
            <div className="bg-[#1e40af] text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <span className="font-bold">Mobile Banking Breakdown</span>
              <button onClick={() => setShowMobileBreakdown(false)} className="text-white/80 hover:text-white">
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-400">
                {collectionFrom} — {collectionTo}
              </div>
              {mobileBreakdownRows.every((r) => r.amount === 0) ? (
                <p className="text-sm font-bold text-slate-400 text-center py-4">
                  No mobile banking collections for the selected period.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {mobileBreakdownRows.map((r) => (
                    <div key={r.type} className="flex items-center justify-between py-2">
                      <span className="font-bold text-slate-700">{r.type}</span>
                      <span className="font-black text-slate-900">৳{fmt(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-300">
                <span className="font-black text-slate-800">Total</span>
                <span className="font-black text-blue-700">৳{fmt(collectionData?.collection.mobile ?? 0)}</span>
              </div>
              <button
                onClick={() => setShowMobileBreakdown(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCardBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-300 rounded-lg max-w-md w-full shadow-2xl">
            <div className="bg-[#1e40af] text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <span className="font-bold">Card Breakdown</span>
              <button onClick={() => setShowCardBreakdown(false)} className="text-white/80 hover:text-white">
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-400">
                {collectionFrom} — {collectionTo}
              </div>
              {cardBreakdownRows.length === 0 ? (
                <p className="text-sm font-bold text-slate-400 text-center py-4">
                  No card collections for the selected period.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cardBreakdownRows.map((r) => (
                    <div key={r.type} className="flex items-center justify-between py-2">
                      <span className="font-bold text-slate-700">{r.type}</span>
                      <span className="font-black text-slate-900">৳{fmt(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-300">
                <span className="font-black text-slate-800">Total</span>
                <span className="font-black text-blue-700">৳{fmt(collectionData?.collection.card ?? 0)}</span>
              </div>
              <button
                onClick={() => setShowCardBreakdown(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
