import { Router } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { exportLimiter } from '../middleware/rateLimit';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// PHARMACY STOCK REPORT
//
// Valuation of what is physically on the shelf right now. Unlike Sales Report
// (which reads Sale rows over a period), every figure here comes from current
// Batch rows:
//
//   QOH / Current Stock   SUM(stockQty)
//   COGS / Cost Value     SUM(stockQty * purchasePrice)   what the stock cost
//   Sales Value           SUM(stockQty * sellingPrice)    what it will sell for
//   Profit (TK)           Sales Value - COGS
//   Profit (%)            Profit / Sales Value * 100      margin on the sale
//
// Only batches with stockQty > 0 are counted: a product with none left isn't a
// SKU on hand, and counting it would pad every row with the whole 17k catalog.
// =======================================================

type StockReportFilters = {
  shopId: number;
  storeId?: string;
  departmentId?: string;
  subDepartmentId?: string;
  supplierId?: string;
  generic?: string;
  dosageForm?: string;
  productId?: string;
  from?: string;
  to?: string;
};

function buildStockReportQuery(f: StockReportFilters) {
  const conditions: string[] = ['p."shopId" = $1', 'b."stockQty" > 0'];
  const params: any[] = [f.shopId];
  let idx = 2;
  const push = (cond: string, ...vals: any[]) => {
    let filled = cond;
    for (const val of vals) {
      filled = filled.replace('$N', `$${idx}`);
      params.push(val);
      idx += 1;
    }
    conditions.push(filled);
  };

  if (f.storeId) push('b."storeId" = $N', Number(f.storeId));
  if (f.departmentId) push('p."departmentId" = $N', Number(f.departmentId));
  if (f.subDepartmentId) push('p."subDepartmentId" = $N', Number(f.subDepartmentId));
  if (f.supplierId) push('p."defaultSupplierId" = $N', Number(f.supplierId));
  if (f.productId) push('p.id = $N', Number(f.productId));
  if (f.dosageForm) push('p."dosageForm" = $N', f.dosageForm);
  if (f.generic) push('p."genericName" ILIKE $N', `%${f.generic}%`);
  // Both optional and blank by default, so the report reads as a plain
  // "everything on hand" snapshot. When set they narrow it to stock received
  // (i.e. the batch created) inside the window.
  if (f.from) push('b."createdAt" >= $N', new Date(f.from));
  if (f.to) push('b."createdAt" <= $N', new Date(`${f.to}T23:59:59.999Z`));

  const whereSql = conditions.join(' AND ');
  const fromSql = `
    FROM "Batch" b
    JOIN "Product" p ON p.id = b."productId"
    JOIN "Department" d ON d.id = p."departmentId"
    JOIN "Store" st ON st.id = b."storeId"
    LEFT JOIN "Supplier" sup ON sup.id = p."defaultSupplierId"
  `;

  return { whereSql, fromSql, params };
}

// The report is headed by the shop's own name (the one the Super Admin set), not
// the internal branch name — a single-branch pharmacy should read "Bismillah
// Pharmacy", not "Main Store". A shop that genuinely has several branches keeps
// the branch in parentheses so its rows stay distinguishable.
function outletLabeller(shopName: string, storeCount: number) {
  return (storeName: string) => (storeCount > 1 ? `${shopName} (${storeName})` : shopName);
}

// One count per request tells us whether branch names need to be shown at all.
async function labellerFor(req: any) {
  const storeCount = await prisma.store.count({ where: { shopId: req.shop!.id } });
  return outletLabeller(req.shop!.name, storeCount);
}

const parseFilters = (req: any): StockReportFilters => ({
  shopId: req.shop!.id,
  storeId: req.query.storeId ? String(req.query.storeId) : undefined,
  departmentId: req.query.departmentId ? String(req.query.departmentId) : undefined,
  subDepartmentId: req.query.subDepartmentId ? String(req.query.subDepartmentId) : undefined,
  supplierId: req.query.supplierId ? String(req.query.supplierId) : undefined,
  generic: req.query.generic ? String(req.query.generic) : undefined,
  dosageForm: req.query.dosageForm ? String(req.query.dosageForm) : undefined,
  productId: req.query.productId ? String(req.query.productId) : undefined,
  from: req.query.from ? String(req.query.from) : undefined,
  to: req.query.to ? String(req.query.to) : undefined,
});

// Profit is derived in TypeScript rather than SQL so the department rows, the
// per-outlet Total and the Grand Total all go through one formula and can't
// drift apart.
type Valued = { cogs: number; salesValue: number };
const withProfit = <T extends Valued>(row: T) => {
  const profit = row.salesValue - row.cogs;
  return { ...row, profit, profitPct: row.salesValue > 0 ? (profit / row.salesValue) * 100 : 0 };
};

type Countable = Valued & { skuCount: number; qoh: number };
function summarise(rows: Countable[]) {
  const base = rows.reduce(
    (a, r) => ({
      skuCount: a.skuCount + r.skuCount,
      qoh: a.qoh + r.qoh,
      cogs: a.cogs + r.cogs,
      salesValue: a.salesValue + r.salesValue,
    }),
    { skuCount: 0, qoh: 0, cogs: 0, salesValue: 0 },
  );
  return withProfit(base);
}

// -------------------------------------------------------
// DEPARTMENT WISE
// -------------------------------------------------------

async function runDepartmentWise(f: StockReportFilters, label: (storeName: string) => string) {
  const { whereSql, fromSql, params } = buildStockReportQuery(f);
  const raw = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
       st.name AS "outletName",
       d.name AS "departmentName",
       COUNT(DISTINCT p.id)::int AS "skuCount",
       COALESCE(SUM(b."stockQty"), 0)::int AS qoh,
       COALESCE(SUM(b."stockQty" * b."purchasePrice"), 0)::float AS cogs,
       COALESCE(SUM(b."stockQty" * b."sellingPrice"), 0)::float AS "salesValue"
     ${fromSql}
     WHERE ${whereSql}
     GROUP BY st.name, d.name
     ORDER BY st.name ASC, d.name ASC`,
    ...params,
  );
  const rows = raw.map((r) => withProfit({ ...r, outletName: label(r.outletName) }));

  // The report can span several outlets, so each gets its own Total and the
  // whole thing closes with one Grand Total — same layout as the printed sheet.
  const outlets = [...new Set(rows.map((r) => r.outletName as string))].map((outletName) => {
    const own = rows.filter((r) => r.outletName === outletName);
    return { outletName, rows: own, total: summarise(own) };
  });

  return { outlets, grandTotal: summarise(rows) };
}

router.get('/stock-report/department-wise', requirePermission('stock-report'), asyncHandler(async (req, res) => {
  res.json(await runDepartmentWise(parseFilters(req), await labellerFor(req)));
}));

// -------------------------------------------------------
// VENDOR WISE
// -------------------------------------------------------

async function runVendorWise(f: StockReportFilters, label: (storeName: string) => string) {
  const { whereSql, fromSql, params } = buildStockReportQuery(f);
  const raw = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
       st.name AS "storeName",
       COALESCE(sup.name, 'Unassigned') AS "vendorName",
       COUNT(DISTINCT p.id)::int AS "skuCount",
       COALESCE(SUM(b."stockQty"), 0)::int AS qoh,
       COALESCE(SUM(b."stockQty" * b."purchasePrice"), 0)::float AS cogs,
       COALESCE(SUM(b."stockQty" * b."sellingPrice"), 0)::float AS "salesValue"
     ${fromSql}
     WHERE ${whereSql}
     GROUP BY st.name, COALESCE(sup.name, 'Unassigned')
     ORDER BY COALESCE(SUM(b."stockQty"), 0) ASC, COALESCE(sup.name, 'Unassigned') ASC`,
    ...params,
  );
  const rows = raw.map((r) => withProfit({ ...r, storeName: label(r.storeName) }));
  return { rows, grandTotal: summarise(rows) };
}

router.get('/stock-report/vendor-wise', requirePermission('stock-report'), asyncHandler(async (req, res) => {
  res.json(await runVendorWise(parseFilters(req), await labellerFor(req)));
}));

// -------------------------------------------------------
// EXPORT — one endpoint; the report type picks the sheet
// -------------------------------------------------------

const money = (n: number) => Number(n.toFixed(4));

router.get('/stock-report/export', requirePermission('stock-report'), exportLimiter, asyncHandler(async (req, res) => {
  const reportType = String(req.query.reportType || 'DEPARTMENT');
  const filters = parseFilters(req);
  const label = await labellerFor(req);
  const sheet: Record<string, string | number>[] = [];
  let sheetName: string;
  let fileName: string;

  if (reportType === 'VENDOR') {
    const { rows, grandTotal } = await runVendorWise(filters, label);
    rows.forEach((r, i) =>
      sheet.push({
        Sl: i + 1,
        'Store Name': r.storeName,
        'Vendor Name': r.vendorName,
        'Current Stock': r.qoh,
        'Total Sales Value': money(r.salesValue),
        'Total Cost Value': money(r.cogs),
      }),
    );
    sheet.push({
      Sl: '',
      'Store Name': '',
      'Vendor Name': 'Grand Total',
      'Current Stock': grandTotal.qoh,
      'Total Sales Value': money(grandTotal.salesValue),
      'Total Cost Value': money(grandTotal.cogs),
    });
    sheetName = 'Vendor Wise Stock Report';
    fileName = 'vendor-wise-stock-report.xlsx';
  } else {
    const { outlets, grandTotal } = await runDepartmentWise(filters, label);
    const line = (outletName: string, departmentName: string, r: ReturnType<typeof summarise> | any) => ({
      'Outlet Name': outletName,
      'Department Name': departmentName,
      'SKU No': r.skuCount,
      QOH: r.qoh,
      COGS: money(r.cogs),
      'Sales Value': money(r.salesValue),
      'Profit (TK)': money(r.profit),
      'Profit (%)': Number(r.profitPct.toFixed(2)),
    });
    for (const outlet of outlets) {
      outlet.rows.forEach((r) => sheet.push(line(outlet.outletName, r.departmentName, r)));
      sheet.push(line('', 'Total', outlet.total));
    }
    sheet.push(line('', 'Grand Total', grandTotal));
    sheetName = 'Dept Wise Stock Report';
    fileName = 'department-wise-stock-report.xlsx';
  }

  const worksheet = XLSX.utils.json_to_sheet(sheet);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(buffer);
}));

export default router;
