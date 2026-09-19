"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Landmark,
  PackageSearch,
  Receipt,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,

  Bar,
  BarChart,
  ComposedChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { FinanceOverview, JournalEntry, JournalResponse, PharmaSplit } from "../../types";
import { fmt } from "../../lib/format";
import { DashboardTabBar } from "./DashboardTabBar";
import { PaginationBar } from "./PaginationBar";

const PAGE_SIZE = 10;
const TAKA = "৳";

// Built from the local calendar parts, NOT via toISOString(): that converts to
// UTC first, so in Bangladesh (UTC+6) a date pinned to local midnight went back
// a day — which is why the 1 April year start arrived in the From box reading
// "2026-03-31", and why a month start would otherwise read as the 31st of the
// month before.
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const money = (n: number) => `${TAKA}${fmt(n)}`;
const int = (n: number) => Number(n || 0).toLocaleString();
// Long money values crowd a KPI tile, so large figures collapse to k/L/Cr —
// the units a Bangladeshi pharmacy actually reads.
const compact = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1e7) return `${TAKA}${(n / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${TAKA}${(n / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${TAKA}${(n / 1e3).toFixed(1)}k`;
  return money(n);
};

// Financial years here run April–March, the convention the reference report
// uses; "This FY" therefore means the current financial year, not Jan–Dec.
function financialYearBounds(ref = new Date()) {
  const year = ref.getMonth() >= 3 ? ref.getFullYear() : ref.getFullYear() - 1;
  return { from: new Date(year, 3, 1), to: new Date(year + 1, 2, 31, 23, 59, 59), label: `${year}-${year + 1}` };
}

// The first day of the month being worked in — what the screen opens on.
// It used to open on the financial year's start, which in practice meant
// arriving at Finance Overview in September and being shown a range that began
// the previous 1 April. "This FY" is still one click away in the presets.
const monthStart = (ref = new Date()) => new Date(ref.getFullYear(), ref.getMonth(), 1);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TYPE_STYLES: Record<JournalEntry["type"], string> = {
  Sales: "bg-emerald-100 text-emerald-700",
  Purchase: "bg-amber-100 text-amber-700",
  Expense: "bg-rose-100 text-rose-700",
  Salary: "bg-blue-100 text-blue-700",
};

const PAYMENT_COLORS = ["#047857", "#2563eb", "#7c3aed", "#f59e0b"];

const Card: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> = ({
  title,
  icon,
  children,
  right,
}) => (
  <div className="bg-white border border-slate-300 rounded-xl shadow-sm flex flex-col min-w-0">
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
      <span className="font-black text-slate-800 uppercase text-sm flex items-center gap-2 min-w-0">
        {icon}
        <span className="truncate">{title}</span>
      </span>
      {right}
    </div>
    <div className="p-4 min-w-0">{children}</div>
  </div>
);

const Delta: React.FC<{ pct: number }> = ({ pct }) => {
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-black ${up ? "text-emerald-700" : "text-rose-600"}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
};

const Kpi: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "slate" | "emerald" | "rose" | "amber";
  sub?: React.ReactNode;
  title?: string;
}> = ({ label, value, icon, tone = "slate", sub, title }) => (
  <div className="bg-white border border-slate-300 rounded-xl px-4 py-3 shadow-sm min-w-0" title={title}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide truncate">{label}</span>
      <span className="text-slate-400 shrink-0">{icon}</span>
    </div>
    <div
      className={`text-xl font-black mt-1 break-words ${
        tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-700" : "text-slate-900"
      }`}
    >
      {value}
    </div>
    {sub && <div className="text-[11px] font-semibold text-slate-400 mt-0.5 truncate">{sub}</div>}
  </div>
);

// A ranked list with a bar behind each row showing its share of the leader —
// turns six numbers into something readable at a glance.
const RankedList: React.FC<{
  rows: { name: string; value: number; note?: string }[];
  format?: (n: number) => string;
  empty: string;
  colour?: string;
}> = ({ rows, format = money, empty, colour = "#047857" }) => {
  const max = rows.reduce((a, r) => Math.max(a, r.value), 0);
  if (rows.length === 0) {
    return <div className="py-6 text-center text-xs font-bold text-slate-400">{empty}</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-bold text-slate-700 truncate" title={r.name}>
              {r.name}
            </span>
            <span className="font-black text-slate-900 shrink-0">{format(r.value)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`, backgroundColor: colour }}
              />
            </div>
            {r.note && <span className="text-[10px] font-semibold text-slate-400 shrink-0">{r.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
};

const SnapshotStat: React.FC<{
  label: string;
  value: string;
  // Given for the figures that divide across the two sides of the shop; the
  // stat then opens on click to show them. Omitted where the split has no
  // meaning (Catalog Items, Customers, Employees, Stores), and those stay
  // plain rather than pretending to be expandable.
  split?: PharmaSplit;
  // How to render each side, so money reads as money and counts as counts.
  format?: (n: number) => string;
  // Suppliers are counted on both sides when they supply both, so their two
  // figures need not sum to the total; the note says so rather than leaving
  // the arithmetic looking wrong.
  note?: string;
}> = ({ label, value, split, format = int, note }) => {
  const [open, setOpen] = useState(false);
  if (!split) {
    return (
      <div className="text-center min-w-0">
        <div className="text-[10px] font-black text-slate-500 uppercase truncate">{label}</div>
        <div className="font-black text-slate-900 text-sm truncate">{value}</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      title={open ? "Hide the Pharma / Non-Pharma split" : "Show the Pharma / Non-Pharma split"}
      className="text-center min-w-0 rounded px-1 py-0.5 hover:bg-slate-100 transition-colors"
    >
      <div className="text-[10px] font-black text-slate-500 uppercase truncate inline-flex items-center gap-0.5">
        {label}
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      <div className="font-black text-slate-900 text-sm truncate">{value}</div>
      {open && (
        <div className="mt-1 space-y-0.5 text-[10px] font-bold">
          <div className="flex items-center justify-between gap-2">
            <span className="text-emerald-700">Pharma</span>
            <span className="text-slate-900">{format(split.pharma)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-blue-700">Non-Pharma</span>
            <span className="text-slate-900">{format(split.nonPharma)}</span>
          </div>
          {note && <div className="text-[9px] font-semibold text-slate-400 pt-0.5">{note}</div>}
        </div>
      )}
    </button>
  );
};

export const MediboxFinanceOverviewView: React.FC = () => {
  const { shopSlug, token, stores, selectedStoreId, shopName, shopAddress } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);
  const fy = useMemo(() => financialYearBounds(), []);

  const [from, setFrom] = useState(toInputDate(monthStart()));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [storeId, setStoreId] = useState<string>(selectedStoreId ? String(selectedStoreId) : "");

  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [journal, setJournal] = useState<JournalResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => ({ from, to, storeId: storeId || undefined }), [from, to, storeId]);

  const loadOverview = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getFinanceOverview(params)
      .then(setOverview)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not reach the server — showing what was last loaded."))
      .finally(() => setLoading(false));
  }, [api, params]);

  const loadJournal = useCallback(
    (targetPage: number) => {
      setLoadingJournal(true);
      api
        .getFinanceJournal({ ...params, page: targetPage, pageSize: PAGE_SIZE })
        .then((r) => {
          setJournal(r);
          setPage(r.page);
        })
        .catch(() => setJournal(null))
        .finally(() => setLoadingJournal(false));
    },
    [api, params],
  );

  // Fired from a timer rather than straight from the effect body: the loaders
  // flip `loading` synchronously, and doing that during an effect cascades an
  // extra render. The 0ms hop also coalesces the burst of updates you get while
  // typing into the date inputs into a single fetch.
  useEffect(() => {
    const t = setTimeout(() => {
      loadOverview();
      loadJournal(1);
    }, 0);
    return () => clearTimeout(t);
  }, [loadOverview, loadJournal]);

  const current = overview?.current;
  const snapshot = overview?.snapshot;
  const leaders = overview?.leaders;
  const alerts = overview?.alerts;

  // Filtering the visible page only — the ledger is server-paged, so this is a
  // "find it on this page" aid rather than a full-ledger search.
  const visibleRows = (journal?.rows ?? []).filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.description.toLowerCase().includes(q) ||
      r.transactionId.toLowerCase().includes(q) ||
      r.account.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  });

  const chartData = (overview?.monthly ?? []).map((m) => {
    const [y, mm] = m.month.split("-");
    return { ...m, label: `${MONTH_NAMES[Number(mm) - 1]} ${y.slice(2)}` };
  });

  const paymentData = leaders
    ? [
        { name: "Cash", value: leaders.paymentMix.cash },
        { name: "Card", value: leaders.paymentMix.card },
        { name: "Mobile Banking", value: leaders.paymentMix.mobile },
        { name: "Due", value: leaders.paymentMix.due },
      ].filter((d) => d.value > 0)
    : [];
  const paymentTotal = paymentData.reduce((a, d) => a + d.value, 0);

  const totalPages = Math.max(1, Math.ceil((journal?.total ?? 0) / PAGE_SIZE));
  const marginPct = current && current.income > 0 ? (current.netProfit / current.income) * 100 : 0;
  const avgSale = current && current.invoiceCount > 0 ? current.income / current.invoiceCount : 0;

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900">
      <DashboardTabBar activeRoute="finance-overview" />

      <div className="p-4 space-y-4 w-full overflow-y-auto flex-1">
        {/* ── Header + period ─────────────────────────────────── */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 uppercase">
                <BookOpen className="w-5 h-5 text-emerald-700 shrink-0" />
                <span className="truncate">Financial Overview</span>
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                {shopName}
                {shopAddress ? ` · ${shopAddress}` : ""}
              </p>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                {from} to {to} · FY {fy.label} · every figure is read live from Billing, GRN, Expenses and Employee
                Salary
              </p>
            </div>
            <div className="flex items-end gap-2 text-xs flex-wrap">
              <div>
                <label className="font-bold text-slate-700 block mb-1">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1.5 font-semibold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1.5 font-semibold"
                />
              </div>
              {stores.length > 1 && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Store</label>
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1.5 font-semibold"
                  >
                    <option value="">All Stores</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {[
                { label: "This FY", f: fy.from, t: new Date() },
                { label: "This Month", f: new Date(new Date().getFullYear(), new Date().getMonth(), 1), t: new Date() },
                { label: "Today", f: new Date(), t: new Date() },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setFrom(toInputDate(p.f));
                    setTo(toInputDate(p.t));
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded"
                >
                  {p.label}
                </button>
              ))}
              {loading && <Spinner size="xs" />}
            </div>
          </div>
          {error && <p className="text-red-600 font-bold text-xs mt-3">{error}</p>}
        </div>

        {loading && !overview ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400 font-bold">
            <Spinner size="lg" />
            Loading financial overview...
          </div>
        ) : (
          <>
            {/* ── Needs attention ───────────────────────────────── */}
            {alerts &&
              (alerts.expired.items > 0 ||
                alerts.expiringSoon.items > 0 ||
                alerts.lowStockCount > 0 ||
                alerts.outOfStockCount > 0 ||
                alerts.receivables.outstanding > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {alerts.expired.items > 0 && (
                    <div className="bg-rose-50 border border-rose-300 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-rose-700 uppercase">
                        <AlertTriangle className="w-3.5 h-3.5" /> Expired Stock
                      </div>
                      <div className="text-lg font-black text-rose-700 mt-0.5">{money(alerts.expired.costValue)}</div>
                      <div className="text-[11px] font-semibold text-rose-600">
                        {int(alerts.expired.items)} batches · {int(alerts.expired.qty)} units at cost
                      </div>
                    </div>
                  )}
                  {alerts.expiringSoon.items > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-amber-700 uppercase">
                        <CalendarClock className="w-3.5 h-3.5" /> Expiring in 90 Days
                      </div>
                      <div className="text-lg font-black text-amber-700 mt-0.5">
                        {money(alerts.expiringSoon.costValue)}
                      </div>
                      <div className="text-[11px] font-semibold text-amber-600">
                        {int(alerts.expiringSoon.items)} batches · {int(alerts.expiringSoon.qty)} units at cost
                      </div>
                    </div>
                  )}
                  {(alerts.lowStockCount > 0 || alerts.outOfStockCount > 0) && (
                    <div className="bg-blue-50 border border-blue-300 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-blue-700 uppercase">
                        <PackageSearch className="w-3.5 h-3.5" /> At / Below Reorder
                      </div>
                      <div className="text-lg font-black text-blue-700 mt-0.5">{int(alerts.lowStockCount)}</div>
                      <div className="text-[11px] font-semibold text-blue-600">
                        in stock but at/below level · {int(alerts.outOfStockCount)} never stocked
                      </div>
                    </div>
                  )}
                  {alerts.receivables.outstanding > 0 && (
                    <div className="bg-slate-100 border border-slate-300 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase">
                        <Receipt className="w-3.5 h-3.5" /> Outstanding Dues
                      </div>
                      <div className="text-lg font-black text-slate-800 mt-0.5">
                        {money(alerts.receivables.outstanding)}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500">
                        across {int(alerts.receivables.invoices)} invoices
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* ── Headline figures ──────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi
                label="Income"
                value={compact(current?.income ?? 0)}
                title={money(current?.income ?? 0)}
                icon={<Wallet className="w-4 h-4" />}
                tone="emerald"
                sub={
                  <span className="inline-flex items-center gap-1">
                    <Delta pct={overview?.growth.income ?? 0} /> vs previous
                  </span>
                }
              />
              <Kpi
                label="Spend"
                value={compact(current?.totalDebit ?? 0)}
                title={money(current?.totalDebit ?? 0)}
                icon={<Landmark className="w-4 h-4" />}
                tone="amber"
                sub="Purchases + expenses + salaries"
              />
              <Kpi
                label="Gross Profit"
                value={compact(current?.grossProfit ?? 0)}
                title={money(current?.grossProfit ?? 0)}
                icon={<TrendingUp className="w-4 h-4" />}
                sub={`COGS ${compact(current?.cogs ?? 0)}`}
              />
              <Kpi
                label="Net Profit"
                value={compact(current?.netProfit ?? 0)}
                title={money(current?.netProfit ?? 0)}
                icon={<TrendingUp className="w-4 h-4" />}
                tone={(current?.netProfit ?? 0) >= 0 ? "emerald" : "rose"}
                sub={
                  <span className="inline-flex items-center gap-1">
                    <Delta pct={overview?.growth.netProfit ?? 0} /> vs previous
                  </span>
                }
              />
              <Kpi
                label="Net Margin"
                value={`${marginPct.toFixed(1)}%`}
                icon={<Receipt className="w-4 h-4" />}
                tone={marginPct >= 0 ? "emerald" : "rose"}
                sub="Net profit ÷ income"
              />
              <Kpi
                label="Invoices"
                value={int(current?.invoiceCount ?? 0)}
                icon={<CreditCard className="w-4 h-4" />}
                sub={`Avg ${compact(avgSale)} per sale`}
              />
            </div>

            {/* ── Shop snapshot ─────────────────────────────────── */}
            <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Boxes className="w-4 h-4 text-emerald-700" />
                <span className="font-black text-slate-800 uppercase text-sm">Shop Snapshot</span>
                <span className="text-[11px] font-semibold text-slate-400">as it stands right now</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* Shown in full, not abbreviated: these two are the value of
                    everything on the shelves, and "145k" hides the thousands
                    that matter when reconciling against a stock count. */}
                <SnapshotStat
                  label="Stock (Cost)"
                  value={money(snapshot?.stockOnHand.costValue ?? 0)}
                  split={snapshot?.split.costValue}
                  format={money}
                />
                <SnapshotStat
                  label="Stock (Retail)"
                  value={money(snapshot?.stockOnHand.retailValue ?? 0)}
                  split={snapshot?.split.retailValue}
                  format={money}
                />
                <SnapshotStat
                  label="Qty On Hand"
                  value={int(snapshot?.stockOnHand.qoh ?? 0)}
                  split={snapshot?.split.qoh}
                />
                <SnapshotStat
                  label="SKUs In Stock"
                  value={int(snapshot?.stockOnHand.skus ?? 0)}
                  split={snapshot?.split.skus}
                />
                <SnapshotStat label="Catalog Items" value={int(snapshot?.products ?? 0)} />
                <SnapshotStat label="Customers" value={int(snapshot?.customers ?? 0)} />
                <SnapshotStat
                  label="Suppliers"
                  value={int(snapshot?.suppliers ?? 0)}
                  split={snapshot?.split.suppliers}
                  note="Counted on both sides if they supply both"
                />
                <SnapshotStat label="Employees" value={int(snapshot?.employees ?? 0)} />
              </div>
            </div>

            {/* ── Trends ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2">
                <Card title="Income vs Spend by Month" icon={<TrendingUp className="w-4 h-4 text-emerald-700" />}>
                  <div className="h-64">
                    {chartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">
                        No months in this range.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <defs>
                            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#047857" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#047857" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={56} tickFormatter={compact} />
                          <Tooltip formatter={(v, n) => [money(Number(v) || 0), String(n)]} />
                          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                          <Area type="monotone" dataKey="income" name="Income" stroke="#047857" strokeWidth={2} fill="url(#incomeFill)" />
                          <Area type="monotone" dataKey="purchases" name="Purchases" stroke="#f59e0b" strokeWidth={2} fill="url(#spendFill)" />
                          <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>
              </div>

              <Card title="How Customers Paid" icon={<CreditCard className="w-4 h-4 text-emerald-700" />}>
                {paymentTotal === 0 ? (
                  <div className="h-64 flex items-center justify-center text-xs font-bold text-slate-400 text-center px-4">
                    No payments recorded in this period.
                  </div>
                ) : (
                  <div className="h-64 flex flex-col">
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={2} strokeWidth={0}>
                            {paymentData.map((d, i) => (
                              <Cell key={d.name} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => [money(Number(v) || 0), ""]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1 pt-2">
                      {paymentData.map((d, i) => (
                        <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 font-bold text-slate-700 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }}
                            />
                            <span className="truncate">{d.name}</span>
                          </span>
                          <span className="font-black text-slate-900 shrink-0">
                            {((d.value / paymentTotal) * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* ── Leaderboards ──────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card title="Top Selling Items" icon={<Boxes className="w-4 h-4 text-emerald-700" />}>
                <RankedList
                  rows={(leaders?.topProducts ?? []).map((p) => ({ name: p.name, value: p.revenue, note: `${int(p.qty)} pcs` }))}
                  empty="Nothing sold in this period."
                />
              </Card>
              <Card title="Top Customers" icon={<Users className="w-4 h-4 text-emerald-700" />}>
                <RankedList
                  rows={(leaders?.topCustomers ?? []).map((c) => ({
                    name: c.name,
                    value: c.revenue,
                    note: `${int(c.invoices)} inv`,
                  }))}
                  empty="No sales in this period."
                  colour="#2563eb"
                />
              </Card>
              <Card title="Top Suppliers" icon={<PackageSearch className="w-4 h-4 text-emerald-700" />}>
                <RankedList
                  rows={(leaders?.topSuppliers ?? []).map((s) => ({ name: s.name, value: s.value, note: `${int(s.grns)} GRN` }))}
                  empty="No purchases in this period."
                  colour="#f59e0b"
                />
              </Card>
              <Card title="Where Expenses Went" icon={<Receipt className="w-4 h-4 text-emerald-700" />}>
                <RankedList
                  rows={(leaders?.expenseBreakdown ?? []).map((e) => ({ name: e.name, value: e.amount }))}
                  empty="No expenses in this period."
                  colour="#e11d48"
                />
              </Card>
            </div>

            {/* ── Ledger + P&L ──────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 bg-white border border-slate-300 rounded-xl shadow-sm flex flex-col min-w-0">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 flex-wrap">
                  <span className="font-black text-slate-800 uppercase text-sm">Journal Entries</span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search this page..."
                      className="border border-slate-300 rounded pl-7 pr-2 py-1.5 text-xs font-semibold w-52"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-black uppercase whitespace-nowrap">
                        <th className="py-2.5 px-3 border-b border-slate-200">Date</th>
                        <th className="py-2.5 px-3 border-b border-slate-200">Transaction ID</th>
                        <th className="py-2.5 px-3 border-b border-slate-200">Type</th>
                        <th className="py-2.5 px-3 border-b border-slate-200">Description</th>
                        <th className="py-2.5 px-3 border-b border-slate-200">Account</th>
                        <th className="py-2.5 px-3 border-b border-slate-200 text-right">Debit</th>
                        <th className="py-2.5 px-3 border-b border-slate-200 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="font-semibold">
                      {visibleRows.map((r) => (
                        <tr key={r.id} className="odd:bg-white even:bg-slate-50/60 whitespace-nowrap">
                          <td className="py-2.5 px-3 text-slate-500">{r.date.slice(0, 10)}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">{r.transactionId}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${TYPE_STYLES[r.type]}`}>
                              {r.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-[360px] truncate" title={r.description}>
                            {r.description}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{r.account}</td>
                          <td className="py-2.5 px-3 text-right font-black text-rose-600">
                            {r.debit > 0 ? money(r.debit) : ""}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-700">
                            {r.credit > 0 ? money(r.credit) : ""}
                          </td>
                        </tr>
                      ))}
                      {visibleRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                            {loadingJournal ? (
                              <span className="inline-flex items-center gap-2">
                                <Spinner size="sm" /> Loading...
                              </span>
                            ) : search.trim() ? (
                              "Nothing on this page matches that search."
                            ) : (
                              "No transactions recorded in this period."
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {journal && journal.total > 0 && (
                  <PaginationBar
                    page={page}
                    totalPages={totalPages}
                    total={journal.total}
                    onFirst={() => loadJournal(1)}
                    onPrevious={() => loadJournal(page - 1)}
                    onNext={() => loadJournal(page + 1)}
                    onLast={() => loadJournal(totalPages)}
                    onPageChange={loadJournal}
                  />
                )}
                {journal?.truncated && (
                  <p className="text-[11px] font-semibold text-amber-700 px-4 py-2 border-t border-slate-200">
                    Showing the most recent transactions in this period — narrow the dates to see further back.
                  </p>
                )}
              </div>

              <Card title="Profit & Loss" icon={<Landmark className="w-4 h-4 text-emerald-700" />}>
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: "Medicine Sales", value: current?.income ?? 0, tone: "credit" },
                    { label: "Cost of Goods Sold", value: -(current?.cogs ?? 0), tone: "debit" },
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between gap-2">
                      <span className="font-semibold text-slate-500 truncate">{r.label}</span>
                      <span className={`font-black shrink-0 ${r.tone === "debit" ? "text-rose-600" : "text-emerald-700"}`}>
                        {money(r.value)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2 border-t border-slate-200 pt-1.5">
                    <span className="font-black text-slate-700">Gross Profit</span>
                    <span className="font-black text-slate-900">{money(current?.grossProfit ?? 0)}</span>
                  </div>

                  {[
                    { label: "Inventory Purchases", value: -(current?.purchases ?? 0) },
                    { label: "Operational Costs", value: -(current?.expenses ?? 0) },
                    { label: "Staff Salaries", value: -(current?.salaries ?? 0) },
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between gap-2 pt-0.5">
                      <span className="font-semibold text-slate-500 truncate">{r.label}</span>
                      <span className="font-black text-rose-600 shrink-0">{money(r.value)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between gap-2 border-t-2 border-slate-900 pt-2 mt-1">
                    <span className="font-black text-slate-800 uppercase">Net Profit</span>
                    <span className={`font-black ${(current?.netProfit ?? 0) >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                      {money(current?.netProfit ?? 0)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 mt-3 pt-3">
                  <div className="text-[11px] font-black text-slate-500 uppercase mb-2">This period vs previous</div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: "Previous", income: overview?.previous.income ?? 0, net: overview?.previous.netProfit ?? 0 },
                          { name: "Current", income: overview?.current.income ?? 0, net: overview?.current.netProfit ?? 0 },
                        ]}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v, n) => [money(Number(v) || 0), String(n)]} />
                        <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                        <Bar dataKey="income" name="Income" fill="#047857" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="net" name="Net Profit" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border-t border-slate-200 mt-3 pt-3 text-[11px] font-semibold text-slate-500">
                  Debits {money(current?.totalDebit ?? 0)} · Credits {money(current?.totalCredit ?? 0)} ·{" "}
                  {int(snapshot?.stores ?? 0)} store{(snapshot?.stores ?? 0) === 1 ? "" : "s"}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
