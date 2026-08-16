import { Router } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// SALES REPORT
// =======================================================

// Every "ledger" report (Invoice/Date/User/Pharmacy Wise, plus the — always
// empty, since this app has no cancel feature yet — Cancel reports) shares
// one row shape: a flat, pre-ordered list mixing leaf invoice rows, group
// label rows, per-group "Total:" rows, and a final "Grand Total" row, exactly
// how the source PDF reports lay out. There is no cancellation or refund
// ledger in this system yet, so every Current/Previous *Cancel* and *Refund*
// column is always 0 — flagged here rather than silently invented.
type LedgerRow = {
  key: string;
  isGroupHeader: boolean;
  // A banner row carries no financial data of its own — it's just the
  // "Invoice Date : ..." / "User Name : ..." label line the Details reports
  // print above each group's invoice rows.
  isBanner: boolean;
  isTotal: boolean;
  invoiceNo: string | null;
  invoiceDate: string | null;
  noOfInv: number;
  cogs: number;
  currentCogsCancel: number;
  previousCogsCancel: number;
  totalSales: number;
  currentCancel: number;
  previousCancel: number;
  vat: number;
  currentVatCancel: number;
  previousVatCancel: number;
  actualTotalSales: number;
  currentDiscount: number;
  previousDiscount: number;
  netSales: number;
  currentCollection: number;
  previousCollection: number;
  currentRefund: number;
  previousRefund: number;
  netCollection: number;
  due: number;
};

type SaleLedgerBase = {
  saleId: number;
  invoiceNo: string;
  createdAt: Date;
  storeName: string;
  cashierName: string;
  cogs: number;
  totalSales: number;
  vat: number;
  discount: number;
  netSales: number;
  currentCollection: number;
  paidCash: number;
  paidCard: number;
  paidMobileBanking: number;
  due: number;
  refundAmount: number;
  customerCode: string | null;
  customerName: string | null;
  customerMobile: string | null;
};

function toLeaf(r: SaleLedgerBase): LedgerRow {
  return {
    key: r.invoiceNo,
    isGroupHeader: false,
    isBanner: false,
    isTotal: false,
    invoiceNo: r.invoiceNo,
    invoiceDate: r.createdAt.toISOString(),
    noOfInv: 1,
    cogs: r.cogs,
    currentCogsCancel: 0,
    previousCogsCancel: 0,
    totalSales: r.totalSales,
    currentCancel: 0,
    previousCancel: 0,
    vat: r.vat,
    currentVatCancel: 0,
    previousVatCancel: 0,
    actualTotalSales: r.totalSales,
    currentDiscount: r.discount,
    previousDiscount: 0,
    netSales: r.netSales,
    currentCollection: r.currentCollection,
    previousCollection: 0,
    currentRefund: 0,
    previousRefund: 0,
    netCollection: r.currentCollection,
    due: r.due,
  };
}

function sumLeaves(key: string, isTotal: boolean, leaves: LedgerRow[], isBanner = false): LedgerRow {
  const total: LedgerRow = {
    key,
    isGroupHeader: !isTotal,
    isBanner,
    isTotal,
    invoiceNo: null,
    invoiceDate: null,
    noOfInv: leaves.length,
    cogs: 0,
    currentCogsCancel: 0,
    previousCogsCancel: 0,
    totalSales: 0,
    currentCancel: 0,
    previousCancel: 0,
    vat: 0,
    currentVatCancel: 0,
    previousVatCancel: 0,
    actualTotalSales: 0,
    currentDiscount: 0,
    previousDiscount: 0,
    netSales: 0,
    currentCollection: 0,
    previousCollection: 0,
    currentRefund: 0,
    previousRefund: 0,
    netCollection: 0,
    due: 0,
  };
  for (const l of leaves) {
    total.cogs += l.cogs;
    total.totalSales += l.totalSales;
    total.vat += l.vat;
    total.actualTotalSales += l.actualTotalSales;
    total.currentDiscount += l.currentDiscount;
    total.netSales += l.netSales;
    total.currentCollection += l.currentCollection;
    total.netCollection += l.netCollection;
    total.due += l.due;
  }
  return total;
}

// Groups leaves preserving first-seen order (dates/stores/users appear in
// the order their first sale occurred, matching the PDF report style).
function groupBy(leaves: LedgerRow[], keyOf: (l: LedgerRow, i: number) => string): Map<string, LedgerRow[]> {
  const map = new Map<string, LedgerRow[]>();
  leaves.forEach((l, i) => {
    const k = keyOf(l, i);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(l);
  });
  return map;
}

async function fetchSaleLedgerBase(
  shopId: number,
  filters: { storeId?: string; shift?: string; cashierId?: string; from?: string; to?: string },
): Promise<SaleLedgerBase[]> {
  const conditions: string[] = ['s."shopId" = $1'];
  const params: any[] = [shopId];
  let idx = 2;
  const push = (cond: string, val: any) => {
    conditions.push(cond.replace('$N', `$${idx}`));
    params.push(val);
    idx += 1;
  };
  if (filters.storeId) push('s."storeId" = $N', Number(filters.storeId));
  if (filters.shift) push('s.shift = $N', String(filters.shift));
  if (filters.cashierId) push('s."cashierId" = $N', Number(filters.cashierId));
  if (filters.from) push('s."createdAt" >= $N', new Date(String(filters.from)));
  if (filters.to) push('s."createdAt" <= $N', new Date(`${String(filters.to)}T23:59:59.999Z`));
  const whereSql = conditions.join(' AND ');

  const sql = `
    SELECT
      s.id as "saleId",
      s."invoiceNo",
      s."createdAt",
      st.name as "storeName",
      ca.name as "cashierName",
      COALESCE(cogs.cogs, 0)::float as cogs,
      s."totalAmount"::float as "totalSales",
      s."vatAmount"::float as vat,
      s."discAmt"::float as discount,
      s."netAmount"::float as "netSales",
      s."paidAmount"::float as "currentCollection",
      s."paidCash"::float as "paidCash",
      s."paidCard"::float as "paidCard",
      s."paidMobileBanking"::float as "paidMobileBanking",
      s."dueAmount"::float as due,
      s."refundAmount"::float as "refundAmount",
      cu."customerCode",
      cu.name as "customerName",
      cu.mobile as "customerMobile"
    FROM "Sale" s
    JOIN "Store" st ON st.id = s."storeId"
    JOIN "ShopAdmin" ca ON ca.id = s."cashierId"
    LEFT JOIN "Customer" cu ON cu.id = s."customerId"
    LEFT JOIN LATERAL (
      SELECT SUM(b."purchasePrice" * si.qty)::float as cogs
      FROM "SaleItem" si JOIN "Batch" b ON b.id = si."batchId"
      WHERE si."saleId" = s.id
    ) cogs ON true
    WHERE ${whereSql}
    ORDER BY s."createdAt" ASC
  `;
  return prisma.$queryRawUnsafe<SaleLedgerBase[]>(sql, ...params);
}

// One row per sold SaleItem, with every dimension the six "Pharmacy Sales
// Report (Profit)" sub-reports group/aggregate by. Quantities and money
// figures are already reduced for any partial Invoice-Item-Cancel against
// that line (qty - canceledQty, scaled proportionally), so COGS/Sales
// Value/Discount/VAT/Net Amount always reflect what's actually still sold.
type ProfitReportBase = {
  storeName: string;
  invoiceNo: string;
  invoiceDate: Date;
  itemCode: string | null;
  barcode: string | null;
  itemName: string;
  genericName: string;
  departmentName: string;
  subDepartmentName: string | null;
  supplierName: string;
  dosageForm: string | null;
  displayCategory: string | null;
  packSize: number;
  ppPerPiece: number;
  mrpPerPiece: number;
  qty: number;
  cogs: number;
  salesValue: number;
  discAmt: number;
  vatAmt: number;
  netAmount: number;
};

async function fetchProfitReportBase(
  shopId: number,
  filters: { storeId?: string; shift?: string; cashierId?: string; from?: string; to?: string },
): Promise<ProfitReportBase[]> {
  const conditions: string[] = ['sale."shopId" = $1'];
  const params: any[] = [shopId];
  let idx = 2;
  const push = (cond: string, val: any) => {
    conditions.push(cond.replace('$N', `$${idx}`));
    params.push(val);
    idx += 1;
  };
  if (filters.storeId) push('sale."storeId" = $N', Number(filters.storeId));
  if (filters.shift) push('sale.shift = $N', String(filters.shift));
  if (filters.cashierId) push('sale."cashierId" = $N', Number(filters.cashierId));
  if (filters.from) push('sale."createdAt" >= $N', new Date(String(filters.from)));
  if (filters.to) push('sale."createdAt" <= $N', new Date(`${String(filters.to)}T23:59:59.999Z`));
  const whereSql = conditions.join(' AND ');

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      st.name as "storeName",
      sale."invoiceNo",
      sale."createdAt" as "invoiceDate",
      p."externalCode" as "itemCode",
      b.barcode as "barcode",
      p.name as "itemName",
      p."genericName",
      COALESCE(si."departmentSnapshot", d.name) as "departmentName",
      sd.name as "subDepartmentName",
      COALESCE(si."supplierSnapshot", sup.name, '') as "supplierName",
      p."dosageForm",
      p."displayCategory",
      p."boxQty" as "packSize",
      b."purchasePrice"::float as "ppPerPiece",
      si.mrp::float as "mrpPerPiece",
      si.qty,
      si."canceledQty",
      si."discAmt"::float as "discAmt",
      si."vatAmt"::float as "vatAmt",
      si.total::float as total
    FROM "SaleItem" si
    JOIN "Sale" sale ON sale.id = si."saleId"
    JOIN "Store" st ON st.id = sale."storeId"
    JOIN "Product" p ON p.id = si."productId"
    JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN "SubDepartment" sd ON sd.id = p."subDepartmentId"
    LEFT JOIN "Supplier" sup ON sup.id = p."defaultSupplierId"
    JOIN "Batch" b ON b.id = si."batchId"
    WHERE ${whereSql}
    ORDER BY sale."createdAt" ASC
    `,
    ...params,
  );

  return rows.map((r) => {
    const effectiveQty = Math.max(0, r.qty - r.canceledQty);
    const ratio = r.qty > 0 ? effectiveQty / r.qty : 0;
    return {
      storeName: r.storeName,
      invoiceNo: r.invoiceNo,
      invoiceDate: r.invoiceDate,
      itemCode: r.itemCode,
      barcode: r.barcode,
      itemName: r.itemName,
      genericName: r.genericName,
      departmentName: r.departmentName,
      subDepartmentName: r.subDepartmentName,
      supplierName: r.supplierName,
      dosageForm: r.dosageForm,
      displayCategory: r.displayCategory,
      packSize: r.packSize,
      ppPerPiece: r.ppPerPiece,
      mrpPerPiece: r.mrpPerPiece,
      qty: effectiveQty,
      cogs: r.ppPerPiece * effectiveQty,
      salesValue: r.mrpPerPiece * effectiveQty,
      discAmt: r.discAmt * ratio,
      vatAmt: r.vatAmt * ratio,
      netAmount: r.total * ratio,
    };
  });
}

// Profit% "before discount" mirrors this app's product-level GP% convention
// (profit as a share of the sale/MRP value); "after discount" restates that
// same ratio against Net Amount instead, showing the effect of the discount
// actually given.
function profitPctBefore(profit: number, salesValue: number) {
  return salesValue > 0 ? (profit / salesValue) * 100 : 0;
}
function profitPctAfter(netAmount: number, cogs: number) {
  return netAmount > 0 ? ((netAmount - cogs) / netAmount) * 100 : 0;
}

function groupSum<T extends { cogs: number; salesValue: number; discAmt: number; vatAmt: number; netAmount: number; qty: number }>(
  rows: T[],
) {
  const qty = rows.length;
  const cogs = rows.reduce((a, r) => a + r.cogs, 0);
  const salesValue = rows.reduce((a, r) => a + r.salesValue, 0);
  const discAmt = rows.reduce((a, r) => a + r.discAmt, 0);
  const vatAmt = rows.reduce((a, r) => a + r.vatAmt, 0);
  const netAmount = rows.reduce((a, r) => a + r.netAmount, 0);
  const profit = netAmount - cogs;
  return {
    qty,
    cogs,
    salesValue,
    discAmt,
    vatAmt,
    netAmount,
    profit,
    profitPctBefore: profitPctBefore(salesValue - cogs, salesValue),
    profitPctAfter: profitPctAfter(netAmount, cogs),
  };
}

router.get('/reports/sales', requirePermission('sales-report'), asyncHandler(async (req, res) => {
  const shopId = req.shop!.id;
  const { reportName, storeId, shift, cashierId, from, to } = req.query as Record<string, string | undefined>;
  const name = String(reportName || 'INVOICE_WISE_DETAILS');
  const filters = { storeId, shift, cashierId, from, to };

  if (name === 'ITEM_WISE_DETAILS') {
    const conditions: string[] = ['sale."shopId" = $1'];
    const params: any[] = [shopId];
    let idx = 2;
    const push = (cond: string, val: any) => {
      conditions.push(cond.replace('$N', `$${idx}`));
      params.push(val);
      idx += 1;
    };
    if (storeId) push('sale."storeId" = $N', Number(storeId));
    if (shift) push('sale.shift = $N', String(shift));
    if (cashierId) push('sale."cashierId" = $N', Number(cashierId));
    if (from) push('sale."createdAt" >= $N', new Date(String(from)));
    if (to) push('sale."createdAt" <= $N', new Date(`${String(to)}T23:59:59.999Z`));
    const whereSql = conditions.join(' AND ');

    const itemRows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT p.name as "itemName", p."genericName", d.name as department,
        SUM(si.qty)::float as qty,
        SUM(si.mrp * si.qty)::float as "salesValue",
        SUM(b."purchasePrice" * si.qty)::float as cogs,
        SUM(si."discAmt")::float as "discountAmount",
        SUM(si."vatAmt")::float as "vatAmount",
        SUM(si.total)::float as "netAmount"
      FROM "SaleItem" si
      JOIN "Sale" sale ON sale.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      JOIN "Department" d ON d.id = p."departmentId"
      JOIN "Batch" b ON b.id = si."batchId"
      WHERE ${whereSql}
      GROUP BY p.name, p."genericName", d.name
      ORDER BY p.name ASC
      `,
      ...params,
    );
    return res.json({ reportName: name, itemRows });
  }

  // =====================================================
  // PHARMACY SALES REPORT (PROFIT) — 6 sub-reports, all built
  // from the same per-sale-item base query.
  // =====================================================
  const profitGroupKeys = <T extends Record<string, any>>(rows: T[], keysOf: (r: T) => string[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const key = keysOf(r).join('');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  };

  if (name === 'PROFIT_DEPT_SUMMARY') {
    const profitBase = await fetchProfitReportBase(shopId, filters);
    const byStore = profitGroupKeys(profitBase, (r) => [r.storeName]);
    const profitRows: any[] = [];
    for (const [storeName, storeRows] of byStore) {
      const byDept = profitGroupKeys(storeRows, (r) => [r.departmentName]);
      for (const [departmentName, deptRows] of byDept) {
        profitRows.push({ isSubTotal: false, storeName, departmentName, ...groupSum(deptRows) });
      }
      profitRows.push({ isSubTotal: true, storeName, departmentName: 'Sub-Total', ...groupSum(storeRows) });
    }
    profitRows.push({ isSubTotal: true, isGrandTotal: true, storeName: '', departmentName: 'Grand Total', ...groupSum(profitBase) });
    return res.json({ reportName: name, profitRows });
  }

  if (name === 'PROFIT_SUBDEPT_SUMMARY') {
    const profitBase = await fetchProfitReportBase(shopId, filters);
    const bySubDept = profitGroupKeys(profitBase, (r) => [r.subDepartmentName || 'UNCATEGORIZED']);
    const profitRows: any[] = [];
    for (const [subDepartmentName, rows] of bySubDept) {
      profitRows.push({ isSubTotal: false, subDepartmentName, ...groupSum(rows) });
    }
    profitRows.push({ isSubTotal: true, isGrandTotal: true, subDepartmentName: 'Grand Total', ...groupSum(profitBase) });
    return res.json({ reportName: name, profitRows });
  }

  if (name === 'PROFIT_ITEM_WISE') {
    const profitBase = await fetchProfitReportBase(shopId, filters);
    const profitRows = profitBase
      .filter((r) => r.qty > 0)
      .map((r) => ({
        ...r,
        profit: r.netAmount - r.cogs,
        profitPctBefore: profitPctBefore(r.salesValue - r.cogs, r.salesValue),
        profitPctAfter: profitPctAfter(r.netAmount, r.cogs),
      }));
    return res.json({ reportName: name, profitRows });
  }

  if (name === 'PROFIT_SUPPLIER_SUMMARY') {
    const profitBase = await fetchProfitReportBase(shopId, filters);
    const byStore = profitGroupKeys(profitBase, (r) => [r.storeName]);
    const profitRows: any[] = [];
    for (const [storeName, storeRows] of byStore) {
      const bySupplier = profitGroupKeys(storeRows, (r) => [r.supplierName || 'UNKNOWN']);
      for (const [supplierName, supplierRows] of bySupplier) {
        profitRows.push({ isSubTotal: false, storeName, supplierName, ...groupSum(supplierRows) });
      }
      profitRows.push({ isSubTotal: true, storeName, supplierName: 'Sub-Total', ...groupSum(storeRows) });
    }
    profitRows.push({ isSubTotal: true, isGrandTotal: true, storeName: '', supplierName: 'Grand Total', ...groupSum(profitBase) });
    return res.json({ reportName: name, profitRows });
  }

  if (name === 'PROFIT_SUPPLIER_TOP_SHEET') {
    const profitBase = await fetchProfitReportBase(shopId, filters);
    const bySupplierDept = profitGroupKeys(profitBase, (r) => [r.supplierName || 'UNKNOWN', r.departmentName]);
    const profitRows: any[] = [];
    for (const [, rows] of bySupplierDept) {
      profitRows.push({ supplierName: rows[0].supplierName || 'UNKNOWN', departmentName: rows[0].departmentName, ...groupSum(rows) });
    }
    profitRows.sort((a, b) => a.supplierName.localeCompare(b.supplierName));
    return res.json({ reportName: name, profitRows });
  }

  if (name === 'PROFIT_SUPPLIER_DETAILS') {
    const profitBase = await fetchProfitReportBase(shopId, filters);
    const profitRows = profitBase
      .filter((r) => r.qty > 0)
      .map((r) => ({
        ...r,
        profit: r.netAmount - r.cogs,
        profitPctBefore: profitPctBefore(r.salesValue - r.cogs, r.salesValue),
        profitPctAfter: profitPctAfter(r.netAmount, r.cogs),
      }));
    return res.json({ reportName: name, profitRows });
  }

  const base = await fetchSaleLedgerBase(shopId, filters);
  const leaves = base.map(toLeaf);

  if (name === 'USER_WISE_COLL_SUMMARY') {
    const byUser = new Map<string, SaleLedgerBase[]>();
    for (const r of base) {
      if (!byUser.has(r.cashierName)) byUser.set(r.cashierName, []);
      byUser.get(r.cashierName)!.push(r);
    }
    const collectionRows = [...byUser.entries()].map(([cashierName, rows]) => {
      const cash = rows.reduce((a, r) => a + r.paidCash, 0);
      const card = rows.reduce((a, r) => a + r.paidCard, 0);
      const mobile = rows.reduce((a, r) => a + r.paidMobileBanking, 0);
      const totalCollection = cash + card + mobile;
      const refund = rows.reduce((a, r) => a + r.refundAmount, 0);
      const netCollection = totalCollection - refund;
      return { cashierName, noOfInv: rows.length, cash, card, mobile, transfer: 0, totalCollection, refund, netCollection };
    });
    return res.json({ reportName: name, collectionRows });
  }

  if (name === 'PHARMACY_DUE_DETAILS' || name === 'DUE_COLLECTION_DETAILS') {
    const dueRows = base
      .filter((r) => (name === 'DUE_COLLECTION_DETAILS' ? r.due > 0.01 && r.currentCollection > 0.01 : r.due > 0.01))
      .map((r) => ({
        saleId: r.saleId,
        invoiceNo: r.invoiceNo,
        invoiceDate: r.createdAt.toISOString(),
        storeName: r.storeName,
        customerCode: r.customerCode || '',
        customerName: r.customerName || 'WALK-IN CUSTOMER',
        mobile: r.customerMobile || '',
        netSales: r.netSales,
        collected: r.currentCollection,
        due: r.due,
      }));
    return res.json({ reportName: name, dueRows });
  }

  if (name === 'PHARMACY_CANCEL_SUMMARY' || name === 'PHARMACY_CANCEL_DETAILS') {
    // No invoice-cancellation feature exists yet, so there is never anything
    // to report here — an intentionally, structurally-correct empty result.
    return res.json({ reportName: name, ledgerRows: [] });
  }

  let ledgerRows: LedgerRow[] = [];
  if (name === 'PHARMACY_WISE_SUMMARY') {
    const groups = groupBy(leaves, (_l, i) => base[i].storeName);
    ledgerRows = [...groups.entries()].map(([storeName, rows]) => sumLeaves(storeName, false, rows));
    ledgerRows.push(sumLeaves('Total =', true, leaves));
  } else if (name === 'DATE_WISE_SUMMARY') {
    const groups = groupBy(leaves, (_l, i) => base[i].createdAt.toISOString().slice(0, 10));
    ledgerRows = [...groups.entries()].map(([date, rows]) => sumLeaves(date, false, rows));
    ledgerRows.push(sumLeaves('Total =', true, leaves));
  } else if (name === 'DATE_WISE_DETAILS') {
    const groups = groupBy(leaves, (_l, i) => base[i].createdAt.toISOString().slice(0, 10));
    for (const [date, rows] of groups) {
      ledgerRows.push(sumLeaves(`Invoice Date : ${date}`, false, [], true));
      ledgerRows.push(...rows);
      ledgerRows.push(sumLeaves('Total:', true, rows));
    }
    ledgerRows.push(sumLeaves('Grand Total', true, leaves));
  } else if (name === 'USER_WISE_DETAILS') {
    const groups = groupBy(leaves, (_l, i) => base[i].cashierName);
    for (const [cashierName, rows] of groups) {
      ledgerRows.push(sumLeaves(`User Name : ${cashierName}`, false, [], true));
      ledgerRows.push(...rows);
      ledgerRows.push(sumLeaves('Total:', true, rows));
    }
    ledgerRows.push(sumLeaves('Grand Total', true, leaves));
  } else {
    // INVOICE_WISE_DETAILS — flat, ungrouped.
    ledgerRows = [...leaves];
    if (leaves.length) ledgerRows.push(sumLeaves('Grand Total', true, leaves));
  }

  res.json({ reportName: name, ledgerRows });
}));

router.get('/reports/sales/export', requirePermission('sales-report'), asyncHandler(async (req, res) => {
  const shopId = req.shop!.id;
  const { reportName, storeId, shift, cashierId, from, to } = req.query as Record<string, string | undefined>;
  const name = String(reportName || 'INVOICE_WISE_DETAILS');
  const base = await fetchSaleLedgerBase(shopId, { storeId, shift, cashierId, from, to });

  const rows = base.map((r) => ({
    'Invoice No': r.invoiceNo,
    'Invoice Date': r.createdAt.toISOString().slice(0, 10),
    Store: r.storeName,
    User: r.cashierName,
    Customer: r.customerName || 'WALK-IN CUSTOMER',
    Mobile: r.customerMobile || '',
    COGS: r.cogs,
    'Total Sales': r.totalSales,
    VAT: r.vat,
    Discount: r.discount,
    'Net Sales': r.netSales,
    Cash: r.paidCash,
    Card: r.paidCard,
    'Mobile Banking': r.paidMobileBanking,
    Collection: r.currentCollection,
    Due: r.due,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 30));
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="sales-report.xlsx"');
  res.send(buffer);
}));

export default router;
