import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// FINANCIAL OVERVIEW  (whole-shop, entirely dynamic)
//
// A general-ledger style read over what this app already records, rather than a
// separate bookkeeping module: nothing here is entered by hand, so the numbers
// can never disagree with the screens they come from.
//
//   Income    Sale.netAmount                    (Billing)
//   COGS      purchase price of what was sold   (shared with the Dashboard's
//                                                aggregateCogs, so Gross Profit
//                                                matches there exactly)
//   Purchases approved Grn.netAmount            (GRN With/Without PO)
//   Expenses  Expense.amount                    (Expenses)
//   Salaries  EmployeeSalary.amount, PAID only  (Employee Salary)
//
//   Gross Profit  Income - COGS
//   Net Profit    Gross Profit - Expenses - Salaries
//
// Debit/Credit follow normal double-entry sense for a retail shop: money coming
// in (sales) is credit, money going out (purchases, expenses, salaries) is
// debit.
// =======================================================

type Totals = {
  income: number;
  cogs: number;
  purchases: number;
  expenses: number;
  salaries: number;
  grossProfit: number;
  netProfit: number;
  totalDebit: number;
  totalCredit: number;
  invoiceCount: number;
};

// This page is latency-bound, not CPU-bound: the database is a hosted Postgres
// a round trip away, so a query that returns instantly still costs ~300ms of
// wire time. Everything below is therefore written as ONE statement per block
// (five statements for the whole page) instead of one per figure — the same
// numbers, roughly a fifth of the wall clock.
//
// storeId reaches the SQL as an inlined integer rather than a bind parameter
// because it appears inside correlated subqueries; it is truncated to an
// integer first so nothing but a number can ever reach the string.
const storeFilter = (storeId: number | undefined, alias: string) =>
  storeId !== undefined && Number.isFinite(storeId)
    ? `AND ${alias}."storeId" = ${Math.trunc(storeId)}`
    : '';

const num = (v: unknown) => Number(v) || 0;

// The five readers below take their Prisma client as an argument, defaulting to
// the shared one. Passing a transaction client instead lets the test suite seed
// sales, assert against them and roll the whole lot back, so the SQL is proven
// on real rows without leaving any behind.
type Db = Pick<typeof prisma, '$queryRawUnsafe'>;


function assembleTotals(r: {
  income: number; invoices: number; cogs: number; purchases: number; expenses: number; salaries: number;
}): Totals {
  const grossProfit = num(r.income) - num(r.cogs);
  return {
    income: num(r.income),
    cogs: num(r.cogs),
    purchases: num(r.purchases),
    expenses: num(r.expenses),
    salaries: num(r.salaries),
    grossProfit,
    netProfit: grossProfit - num(r.expenses) - num(r.salaries),
    totalDebit: num(r.purchases) + num(r.expenses) + num(r.salaries),
    totalCredit: num(r.income),
    invoiceCount: num(r.invoices),
  };
}

// Both windows — the selected period and the one immediately before it, which
// the growth figures compare against — in a single statement. The COGS
// expression is deliberately identical to aggregateCogs() so Gross Profit here
// can never drift from the Dashboard's.
export async function periodTotalsPair(
  shopId: number,
  storeId: number | undefined,
  from: Date,
  to: Date,
  prevFrom: Date,
  prevTo: Date,
  db: Db = prisma,
): Promise<{ current: Totals; previous: Totals }> {
  const s = storeFilter(storeId, 's');
  const g = storeFilter(storeId, 'g');

  const rows = await db.$queryRawUnsafe<
    { period: string; income: number; invoices: number; cogs: number; purchases: number; expenses: number; salaries: number }[]
  >(
    `WITH w(period, f, t) AS (
       VALUES ('current', $2::timestamptz, $3::timestamptz), ('previous', $4::timestamptz, $5::timestamptz)
     )
     SELECT w.period,
       (SELECT COALESCE(SUM(s."netAmount"), 0)::float FROM "Sale" s
         WHERE s."shopId" = $1 AND s."createdAt" >= w.f AND s."createdAt" <= w.t ${s}) AS income,
       (SELECT COUNT(*)::int FROM "Sale" s
         WHERE s."shopId" = $1 AND s."createdAt" >= w.f AND s."createdAt" <= w.t ${s}) AS invoices,
       (SELECT COALESCE(SUM(b."purchasePrice" * GREATEST(si.qty - si."canceledQty", 0)), 0)::float
          FROM "SaleItem" si
          JOIN "Batch" b ON b.id = si."batchId"
          JOIN "Sale" s ON s.id = si."saleId"
         WHERE s."shopId" = $1 AND s."createdAt" >= w.f AND s."createdAt" <= w.t ${s}) AS cogs,
       (SELECT COALESCE(SUM(g."netAmount"), 0)::float FROM "Grn" g
         WHERE g."shopId" = $1 AND g.status = 'APPROVED'
           AND g."approvedAt" >= w.f AND g."approvedAt" <= w.t ${g}) AS purchases,
       (SELECT COALESCE(SUM(e.amount), 0)::float FROM "Expense" e
         WHERE e."shopId" = $1 AND e."createdAt" >= w.f AND e."createdAt" <= w.t) AS expenses,
       -- Only salaries actually paid out are money that left the shop; an
       -- UNPAID row is a plan, not a transaction.
       (SELECT COALESCE(SUM(sal.amount), 0)::float FROM "EmployeeSalary" sal
         WHERE sal."shopId" = $1 AND sal.status = 'PAID'
           AND sal."paidAt" >= w.f AND sal."paidAt" <= w.t) AS salaries
     FROM w`,
    shopId, from, to, prevFrom, prevTo,
  );

  const pick = (period: string) =>
    rows.find((r) => r.period === period) ||
    { period, income: 0, invoices: 0, cogs: 0, purchases: 0, expenses: 0, salaries: 0 };

  return { current: assembleTotals(pick('current')), previous: assembleTotals(pick('previous')) };
}

// Month-by-month across the window for the trend chart: the five sources are
// unioned into one grouped result, so a twelve-month view is a single round
// trip rather than sixty (or five).
export async function monthlySeries(shopId: number, storeId: number | undefined, from: Date, to: Date, db: Db = prisma) {
  const s = storeFilter(storeId, 's');
  const g = storeFilter(storeId, 'g');

  const rows = await db.$queryRawUnsafe<{ month: string; source: string; total: number }[]>(
    `SELECT month, source, SUM(total)::float AS total FROM (
       SELECT to_char(date_trunc('month', s."createdAt"), 'YYYY-MM') AS month, 'income' AS source,
              s."netAmount" AS total
         FROM "Sale" s
        WHERE s."shopId" = $1 AND s."createdAt" >= $2 AND s."createdAt" <= $3 ${s}
       UNION ALL
       SELECT to_char(date_trunc('month', s."createdAt"), 'YYYY-MM'), 'cogs',
              b."purchasePrice" * GREATEST(si.qty - si."canceledQty", 0)
         FROM "SaleItem" si
         JOIN "Batch" b ON b.id = si."batchId"
         JOIN "Sale" s ON s.id = si."saleId"
        WHERE s."shopId" = $1 AND s."createdAt" >= $2 AND s."createdAt" <= $3 ${s}
       UNION ALL
       SELECT to_char(date_trunc('month', g."approvedAt"), 'YYYY-MM'), 'purchases', g."netAmount"
         FROM "Grn" g
        WHERE g."shopId" = $1 AND g.status = 'APPROVED'
          AND g."approvedAt" >= $2 AND g."approvedAt" <= $3 ${g}
       UNION ALL
       SELECT to_char(date_trunc('month', e."createdAt"), 'YYYY-MM'), 'expenses', e.amount
         FROM "Expense" e
        WHERE e."shopId" = $1 AND e."createdAt" >= $2 AND e."createdAt" <= $3
       UNION ALL
       SELECT to_char(date_trunc('month', sal."paidAt"), 'YYYY-MM'), 'salaries', sal.amount
         FROM "EmployeeSalary" sal
        WHERE sal."shopId" = $1 AND sal.status = 'PAID' AND sal."paidAt" >= $2 AND sal."paidAt" <= $3
     ) x
     GROUP BY month, source`,
    shopId, from, to,
  );

  const at = (month: string, source: string) =>
    num(rows.find((r) => r.month === month && r.source === source)?.total);

  // Every month in the window appears, including the empty ones, so the chart
  // shows a real gap rather than silently joining across it.
  const months: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const last = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= last && months.length < 240) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months.map((month) => {
    const income = at(month, 'income');
    const expenses = at(month, 'expenses');
    const salaries = at(month, 'salaries');
    const grossProfit = income - at(month, 'cogs');
    return {
      month,
      income,
      purchases: at(month, 'purchases'),
      expenses,
      salaries,
      grossProfit,
      netProfit: grossProfit - expenses - salaries,
    };
  });
}

// Who and what is actually driving the period: the leaderboards a shop owner
// asks for first. Five top-N lists unioned into one result set with a shared
// (kind, name, v1, v2) shape — one round trip for the whole block. Every figure
// nets off cancelled quantities the same way the totals above do.
export async function periodLeaders(shopId: number, storeId: number | undefined, from: Date, to: Date, db: Db = prisma) {
  const s = storeFilter(storeId, 's');
  const g = storeFilter(storeId, 'g');

  const rows = await db.$queryRawUnsafe<{ kind: string; name: string; v1: number; v2: number }[]>(
    `(SELECT 'product' AS kind, p.name AS name,
             COALESCE(SUM(si.mrp * GREATEST(si.qty - si."canceledQty", 0)), 0)::float AS v1,
             COALESCE(SUM(GREATEST(si.qty - si."canceledQty", 0)), 0)::float AS v2
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId"
        JOIN "Product" p ON p.id = si."productId"
       WHERE s."shopId" = $1 AND s."createdAt" >= $2 AND s."createdAt" <= $3 ${s}
       GROUP BY p.name HAVING SUM(GREATEST(si.qty - si."canceledQty", 0)) > 0
       ORDER BY v1 DESC LIMIT 6)
     UNION ALL
     (SELECT 'customer', COALESCE(c.name, 'Walk-in'),
             COALESCE(SUM(s."netAmount"), 0)::float, COUNT(*)::float
        FROM "Sale" s
        LEFT JOIN "Customer" c ON c.id = s."customerId"
       WHERE s."shopId" = $1 AND s."createdAt" >= $2 AND s."createdAt" <= $3 ${s}
       GROUP BY COALESCE(c.name, 'Walk-in') ORDER BY 3 DESC LIMIT 6)
     UNION ALL
     (SELECT 'supplier', COALESCE(sup.name, 'Unassigned'),
             COALESCE(SUM(g."netAmount"), 0)::float, COUNT(*)::float
        FROM "Grn" g
        LEFT JOIN "Supplier" sup ON sup.id = g."supplierId"
       WHERE g."shopId" = $1 AND g.status = 'APPROVED'
         AND g."approvedAt" >= $2 AND g."approvedAt" <= $3 ${g}
       GROUP BY COALESCE(sup.name, 'Unassigned') ORDER BY 3 DESC LIMIT 6)
     UNION ALL
     (SELECT 'expense', e.name, COALESCE(SUM(e.amount), 0)::float, 0::float
        FROM "Expense" e
       WHERE e."shopId" = $1 AND e."createdAt" >= $2 AND e."createdAt" <= $3
       GROUP BY e.name ORDER BY 3 DESC LIMIT 6)
     UNION ALL
     (SELECT 'payment', k.name, k.amount::float, 0::float
        FROM (SELECT COALESCE(SUM(s."paidCash"), 0) AS cash,
                     COALESCE(SUM(s."paidCard"), 0) AS card,
                     COALESCE(SUM(s."paidMobileBanking"), 0) AS mobile,
                     COALESCE(SUM(s."dueAmount"), 0) AS due
                FROM "Sale" s
               WHERE s."shopId" = $1 AND s."createdAt" >= $2 AND s."createdAt" <= $3 ${s}) t
        CROSS JOIN LATERAL (VALUES ('cash', t.cash), ('card', t.card),
                                   ('mobile', t.mobile), ('due', t.due)) AS k(name, amount))`,
    shopId, from, to,
  );

  const of = (kind: string) => rows.filter((r) => r.kind === kind);
  const payment = (name: string) => num(of('payment').find((r) => r.name === name)?.v1);

  return {
    topProducts: of('product').map((r) => ({ name: r.name, revenue: num(r.v1), qty: Math.round(num(r.v2)) })),
    topCustomers: of('customer').map((r) => ({ name: r.name, revenue: num(r.v1), invoices: Math.round(num(r.v2)) })),
    topSuppliers: of('supplier').map((r) => ({ name: r.name, value: num(r.v1), grns: Math.round(num(r.v2)) })),
    expenseBreakdown: of('expense').map((r) => ({ name: r.name, amount: num(r.v1) })),
    paymentMix: {
      cash: payment('cash'),
      card: payment('card'),
      mobile: payment('mobile'),
      due: payment('due'),
    },
  };
}

// The snapshot and the alerts are one function on purpose. Both are "right
// now" reads over the same Product/Batch rows, and on a 17k-line catalog that
// scan is the single most expensive thing on the page — doing it once and
// answering both from the same pass costs roughly what either did alone.
//
// The alerts are the things a pharmacy needs flagged rather than gone looking
// for: stock about to expire (money already spent that is about to become
// worthless), stock already expired, lines at or below their reorder level, and
// what customers still owe. Like the snapshot they ignore the date range.
export async function shopStanding(shopId: number, storeId: number | undefined, db: Db = prisma) {
  const inStore = storeId !== undefined && Number.isFinite(storeId)
    ? `AND bt."storeId" = ${Math.trunc(storeId)}`
    : '';
  const b = storeFilter(storeId, 'b');
  const s = storeFilter(storeId, 's');

  const rows = await db.$queryRawUnsafe<{
    products: number; customers: number; employees: number; suppliers: number; stores: number;
    qoh: number; skus: number; cost: number; retail: number;
    qohPharma: number; qohNonPharma: number; skusPharma: number; skusNonPharma: number;
    costPharma: number; costNonPharma: number; retailPharma: number; retailNonPharma: number;
    suppliersPharma: number; suppliersNonPharma: number;
    low: number; outofstock: number;
    expiredItems: number; expiredQty: number; expiredCost: number;
    soonItems: number; soonQty: number; soonCost: number;
    dueTotal: number; dueInvoices: number;
  }[]>(
    // One pass over the catalog, reused four ways: valuation, SKU count, the
    // reorder buckets and the "never stocked" count.
    `WITH prod AS (
       SELECT p.id, p."reorderLevel",
              -- Which side of the shop this product sits on, so the snapshot can
              -- be broken down without a second pass over the catalog.
              (d.name = 'Pharma') AS "isPharma",
              COALESCE(SUM(bt."stockQty"), 0) AS qty,
              COALESCE(SUM(bt."stockQty" * bt."purchasePrice"), 0) AS cost,
              COALESCE(SUM(bt."stockQty" * bt."sellingPrice"), 0) AS retail
         FROM "Product" p
         JOIN "Department" d ON d.id = p."departmentId"
         LEFT JOIN "Batch" bt ON bt."productId" = p.id AND bt."stockQty" > 0 ${inStore}
        WHERE p."shopId" = $1
        GROUP BY p.id, p."reorderLevel", d.name
     ),
     expiry AS (
       SELECT COUNT(*) FILTER (WHERE b."expiryDate" < NOW())::float AS "expiredItems",
              COALESCE(SUM(b."stockQty") FILTER (WHERE b."expiryDate" < NOW()), 0)::float AS "expiredQty",
              COALESCE(SUM(b."stockQty" * b."purchasePrice") FILTER (WHERE b."expiryDate" < NOW()), 0)::float AS "expiredCost",
              COUNT(*) FILTER (WHERE b."expiryDate" >= NOW())::float AS "soonItems",
              COALESCE(SUM(b."stockQty") FILTER (WHERE b."expiryDate" >= NOW()), 0)::float AS "soonQty",
              COALESCE(SUM(b."stockQty" * b."purchasePrice") FILTER (WHERE b."expiryDate" >= NOW()), 0)::float AS "soonCost"
         FROM "Batch" b
         JOIN "Product" p ON p.id = b."productId"
        WHERE p."shopId" = $1 AND b."stockQty" > 0
          AND b."expiryDate" < NOW() + INTERVAL '90 days' ${b}
     )
     SELECT
       (SELECT COUNT(*)::int FROM "Product" WHERE "shopId" = $1) AS products,
       (SELECT COUNT(*)::int FROM "Customer" WHERE "shopId" = $1) AS customers,
       (SELECT COUNT(*)::int FROM "Employee" WHERE "shopId" = $1) AS employees,
       (SELECT COUNT(*)::int FROM "Supplier" WHERE "shopId" = $1) AS suppliers,
       (SELECT COUNT(*)::int FROM "Store" WHERE "shopId" = $1) AS stores,
       (SELECT COALESCE(SUM(qty), 0)::float FROM prod) AS qoh,
       (SELECT COUNT(*)::float FROM prod WHERE qty > 0) AS skus,
       (SELECT COALESCE(SUM(cost), 0)::float FROM prod) AS cost,
       (SELECT COALESCE(SUM(retail), 0)::float FROM prod) AS retail,

       -- The same four figures split by department, so each can be opened up on
       -- screen without another trip. Pharma and Non-Pharma always add back to
       -- the totals above: every product belongs to exactly one department.
       (SELECT COALESCE(SUM(qty) FILTER (WHERE "isPharma"), 0)::float FROM prod) AS "qohPharma",
       (SELECT COALESCE(SUM(qty) FILTER (WHERE NOT "isPharma"), 0)::float FROM prod) AS "qohNonPharma",
       (SELECT COUNT(*) FILTER (WHERE qty > 0 AND "isPharma")::float FROM prod) AS "skusPharma",
       (SELECT COUNT(*) FILTER (WHERE qty > 0 AND NOT "isPharma")::float FROM prod) AS "skusNonPharma",
       (SELECT COALESCE(SUM(cost) FILTER (WHERE "isPharma"), 0)::float FROM prod) AS "costPharma",
       (SELECT COALESCE(SUM(cost) FILTER (WHERE NOT "isPharma"), 0)::float FROM prod) AS "costNonPharma",
       (SELECT COALESCE(SUM(retail) FILTER (WHERE "isPharma"), 0)::float FROM prod) AS "retailPharma",
       (SELECT COALESCE(SUM(retail) FILTER (WHERE NOT "isPharma"), 0)::float FROM prod) AS "retailNonPharma",

       -- A supplier has no department of its own, so it is counted by what it
       -- supplies. One supplying both sides is counted on both, which is why
       -- these two need not add up to the total — a supplier is not half a
       -- supplier, and saying otherwise would be a fiction.
       (SELECT COUNT(DISTINCT p."defaultSupplierId")::float
          FROM "Product" p JOIN "Department" d ON d.id = p."departmentId"
         WHERE p."shopId" = $1 AND p."defaultSupplierId" IS NOT NULL AND d.name = 'Pharma') AS "suppliersPharma",
       (SELECT COUNT(DISTINCT p."defaultSupplierId")::float
          FROM "Product" p JOIN "Department" d ON d.id = p."departmentId"
         WHERE p."shopId" = $1 AND p."defaultSupplierId" IS NOT NULL AND d.name <> 'Pharma') AS "suppliersNonPharma",
       -- Split deliberately. A catalog can carry thousands of products that
       -- have a reorder level but were never stocked; lumping those in with
       -- "running low" buries the handful actually about to run out.
       (SELECT COUNT(*)::float FROM prod WHERE "reorderLevel" > 0 AND qty > 0 AND qty <= "reorderLevel") AS low,
       (SELECT COUNT(*)::float FROM prod WHERE "reorderLevel" > 0 AND qty = 0) AS outofstock,
       e."expiredItems", e."expiredQty", e."expiredCost", e."soonItems", e."soonQty", e."soonCost",
       (SELECT COALESCE(SUM(s."dueAmount"), 0)::float FROM "Sale" s
         WHERE s."shopId" = $1 AND s."dueAmount" > 0 ${s}) AS "dueTotal",
       (SELECT COUNT(*)::float FROM "Sale" s
         WHERE s."shopId" = $1 AND s."dueAmount" > 0 ${s}) AS "dueInvoices"
     FROM expiry e`,
    shopId,
  );

  const r = rows[0] || ({} as Record<string, number>);
  const n = (k: keyof typeof r) => num((r as Record<string, unknown>)[k as string]);

  return {
    snapshot: {
      products: n('products'),
      customers: n('customers'),
      employees: n('employees'),
      suppliers: n('suppliers'),
      stores: n('stores'),
      stockOnHand: {
        qoh: Math.round(n('qoh')),
        skus: Math.round(n('skus')),
        costValue: n('cost'),
        retailValue: n('retail'),
      },
      // Pharma / Non-Pharma for the figures that can be opened up on screen.
      split: {
        qoh: { pharma: Math.round(n('qohPharma')), nonPharma: Math.round(n('qohNonPharma')) },
        skus: { pharma: Math.round(n('skusPharma')), nonPharma: Math.round(n('skusNonPharma')) },
        costValue: { pharma: n('costPharma'), nonPharma: n('costNonPharma') },
        retailValue: { pharma: n('retailPharma'), nonPharma: n('retailNonPharma') },
        suppliers: { pharma: Math.round(n('suppliersPharma')), nonPharma: Math.round(n('suppliersNonPharma')) },
      },
    },
    alerts: {
      expired: { items: Math.round(n('expiredItems')), qty: Math.round(n('expiredQty')), costValue: n('expiredCost') },
      expiringSoon: { items: Math.round(n('soonItems')), qty: Math.round(n('soonQty')), costValue: n('soonCost') },
      lowStockCount: Math.round(n('low')),
      outOfStockCount: Math.round(n('outofstock')),
      receivables: { outstanding: n('dueTotal'), invoices: Math.round(n('dueInvoices')) },
    },
  };
}

router.get('/finance/overview', requirePermission('finance-overview'), asyncHandler(async (req, res) => {
  const shopId = req.shop!.id;
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  const now = new Date();

  const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), 0, 1);
  const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999Z`) : new Date();

  // Growth compares against the immediately preceding window of the same
  // length, so a 30-day view is measured against the 30 days before it rather
  // than against an arbitrary calendar boundary.
  const spanMs = Math.max(1, to.getTime() - from.getTime());
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);

  // Four statements, fired together: totals for both windows, the monthly
  // series, the shop's standing (snapshot + alerts), and the leaderboards.
  const [{ current, previous }, monthly, { snapshot, alerts }, leaders] = await Promise.all([
    periodTotalsPair(shopId, storeId, from, to, prevFrom, prevTo),
    monthlySeries(shopId, storeId, from, to),
    shopStanding(shopId, storeId),
    periodLeaders(shopId, storeId, from, to),
  ]);

  const growthPct = (curr: number, prev: number) => {
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  res.json({
    shop: { name: req.shop!.name, address: req.shop!.address, phone: req.shop!.phone },
    period: { from: from.toISOString(), to: to.toISOString() },
    previousPeriod: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
    current,
    previous,
    growth: {
      income: growthPct(current.income, previous.income),
      netProfit: growthPct(current.netProfit, previous.netProfit),
      grossProfit: growthPct(current.grossProfit, previous.grossProfit),
    },
    monthly,
    snapshot,
    leaders,
    alerts,
  });
}));

// The ledger itself: every money movement the app recorded, newest first, as
// uniform journal lines. Assembled from four tables, so it is paged in memory
// after a bounded fetch from each rather than with SQL OFFSET across a UNION.
const JOURNAL_FETCH_CAP = 500;

router.get('/finance/journal', requirePermission('finance-overview'), asyncHandler(async (req, res) => {
  const shopId = req.shop!.id;
  const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
  const now = new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), 0, 1);
  const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999Z`) : new Date();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

  const saleWhere: any = { shopId, createdAt: { gte: from, lte: to } };
  if (storeId) saleWhere.storeId = storeId;
  const grnWhere: any = { shopId, status: 'APPROVED', approvedAt: { gte: from, lte: to } };
  if (storeId) grnWhere.storeId = storeId;

  const [sales, grns, expenses, salaries] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      select: { id: true, invoiceNo: true, netAmount: true, createdAt: true, customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: JOURNAL_FETCH_CAP,
    }),
    prisma.grn.findMany({
      where: grnWhere,
      select: { id: true, transactionNo: true, netAmount: true, approvedAt: true, supplier: { select: { name: true } } },
      orderBy: { approvedAt: 'desc' },
      take: JOURNAL_FETCH_CAP,
    }),
    prisma.expense.findMany({
      where: { shopId, createdAt: { gte: from, lte: to } },
      select: { id: true, name: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: JOURNAL_FETCH_CAP,
    }),
    prisma.employeeSalary.findMany({
      where: { shopId, status: 'PAID', paidAt: { gte: from, lte: to } },
      select: { id: true, amount: true, month: true, paidAt: true, employee: { select: { name: true } } },
      orderBy: { paidAt: 'desc' },
      take: JOURNAL_FETCH_CAP,
    }),
  ]);

  type Entry = {
    id: string;
    date: string;
    transactionId: string;
    type: 'Sales' | 'Purchase' | 'Expense' | 'Salary';
    description: string;
    account: string;
    debit: number;
    credit: number;
  };

  const entries: Entry[] = [
    ...sales.map((s): Entry => ({
      id: `sale-${s.id}`,
      date: s.createdAt.toISOString(),
      transactionId: s.invoiceNo,
      type: 'Sales',
      description: s.customer?.name ? `Customer Sale — ${s.customer.name}` : 'Customer Sale',
      account: 'Medicine Sales',
      debit: 0,
      credit: s.netAmount,
    })),
    ...grns.map((g): Entry => ({
      id: `grn-${g.id}`,
      date: (g.approvedAt ?? new Date()).toISOString(),
      transactionId: g.transactionNo,
      type: 'Purchase',
      description: g.supplier?.name ? `Inventory Purchase — ${g.supplier.name}` : 'Inventory Purchase',
      account: 'Inventory Purchases',
      debit: g.netAmount,
      credit: 0,
    })),
    ...expenses.map((e): Entry => ({
      id: `expense-${e.id}`,
      date: e.createdAt.toISOString(),
      transactionId: `EXP-${String(e.id).padStart(6, '0')}`,
      type: 'Expense',
      description: e.name,
      account: 'Operational Costs',
      debit: e.amount,
      credit: 0,
    })),
    ...salaries.map((s): Entry => ({
      id: `salary-${s.id}`,
      date: (s.paidAt ?? new Date()).toISOString(),
      transactionId: `SAL-${String(s.id).padStart(6, '0')}`,
      type: 'Salary',
      description: `Staff Salary — ${s.employee?.name ?? 'Employee'} (${s.month})`,
      account: 'Staff Salary',
      debit: s.amount,
      credit: 0,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const start = (page - 1) * pageSize;
  res.json({
    rows: entries.slice(start, start + pageSize),
    total: entries.length,
    page,
    pageSize,
    // True when a source hit the fetch cap, so the UI can say the ledger is
    // showing the most recent slice rather than implying it is exhaustive.
    truncated:
      sales.length === JOURNAL_FETCH_CAP ||
      grns.length === JOURNAL_FETCH_CAP ||
      expenses.length === JOURNAL_FETCH_CAP ||
      salaries.length === JOURNAL_FETCH_CAP,
  });
}));

export default router;
