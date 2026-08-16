import { Router } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// STOCK DATA
// =======================================================

router.get('/products/dosage-forms', requirePermission('stock-data'), async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { shopId: req.shop!.id, dosageForm: { not: null } },
    select: { dosageForm: true },
    distinct: ['dosageForm'],
    orderBy: { dosageForm: 'asc' },
  });
  res.json(rows.map((r) => r.dosageForm));
});

router.get('/products/generics', requirePermission('stock-data'), async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { shopId: req.shop!.id, genericName: { not: '' } },
    select: { genericName: true },
    distinct: ['genericName'],
    orderBy: { genericName: 'asc' },
  });
  res.json(rows.map((r) => r.genericName));
});

// Lightweight name-only autocomplete for the Sold Product Ledger's Item
// filter — unlike dosage-forms/generics, product names aren't naturally a
// small deduplicated list, so this is query-driven rather than a full
// preload.
router.get('/products/search-names', requirePermission('sold-product-ledger'), asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || String(q).trim().length < 2) return res.json([]);
  const rows = await prisma.product.findMany({
    where: { shopId: req.shop!.id, name: { contains: String(q), mode: 'insensitive' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  res.json(rows);
}));

// Live suggestions for Stock Data's Search box, matching the same
// itemNo/name/genericName breadth as the actual search filter (buildStockDataQuery
// below) — so the dropdown offers exactly what typing and clicking SEARCH would find.
router.get('/products/stock-search-suggest', requirePermission('stock-data'), asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || String(q).trim().length < 2) return res.json([]);
  const term = String(q).trim();
  const rows = await prisma.product.findMany({
    where: {
      shopId: req.shop!.id,
      OR: [
        { externalCode: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { genericName: { contains: term, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, externalCode: true, genericName: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  res.json(rows);
}));

type StockDataFilters = {
  storeId: number;
  shopId: number;
  type?: string;
  dosageForm?: string;
  generic?: string;
  departmentId?: string;
  supplierId?: string;
  search?: string;
};

function buildStockDataQuery(f: StockDataFilters) {
  const conditions: string[] = ['p."shopId" = $1'];
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

  if (f.type === 'AVAILABLE') conditions.push('COALESCE(b."stockQty", 0) > 0');
  else if (f.type === 'ZERO') conditions.push('COALESCE(b."stockQty", 0) = 0');
  if (f.dosageForm) push('p."dosageForm" = $N', f.dosageForm);
  // Generic is a partial (ingredient) match so typing part of an ingredient
  // like "para" surfaces every medicine sharing that ingredient.
  if (f.generic) {
    const term = `%${f.generic}%`;
    push('p."genericName" ILIKE $N', term);
  }
  if (f.departmentId) push('p."departmentId" = $N', Number(f.departmentId));
  if (f.supplierId) push('p."defaultSupplierId" = $N', Number(f.supplierId));
  if (f.search) {
    const term = `%${f.search}%`;
    push('(p."externalCode" ILIKE $N OR p.name ILIKE $N OR p."genericName" ILIKE $N)', term, term, term);
  }

  const whereSql = conditions.join(' AND ');
  const fromSql = `
    FROM "Product" p
    JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN "Supplier" s ON s.id = p."defaultSupplierId"
    LEFT JOIN "Batch" b ON b."productId" = p.id AND b."storeId" = $${idx}
  `;
  params.push(f.storeId);
  idx += 1;

  return { whereSql, fromSql, params, nextIdx: idx };
}

router.get('/stock-data', requirePermission('stock-data'), async (req, res) => {
  const { storeId, type, dosageForm, generic, departmentId, supplierId, search, page, pageSize } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });

  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(500, Math.max(1, Number(pageSize) || 50));
  const offset = (pageNum - 1) * size;

  const { whereSql, fromSql, params } = buildStockDataQuery({
    storeId: Number(storeId),
    shopId,
    type: type ? String(type) : undefined,
    dosageForm: dosageForm ? String(dosageForm) : undefined,
    generic: generic ? String(generic) : undefined,
    departmentId: departmentId ? String(departmentId) : undefined,
    supplierId: supplierId ? String(supplierId) : undefined,
    search: search ? String(search) : undefined,
  });

  const dataSql = `
    SELECT
      p."externalCode" as "itemNo",
      p.name as "itemName",
      p."genericName",
      p."displayCategory",
      d.name as department,
      s.name as manufacturer,
      COALESCE(
        (SELECT MAX(pr."createdAt") FROM "PurchaseRequisitionItem" pri JOIN "PurchaseRequisition" pr ON pr.id = pri."requisitionId"
          WHERE pri."productId" = p.id AND pr."storeId" = ${Number(storeId)}),
        p."lastPurchaseReqDate"
      ) as "lastPurchaseReqDate",
      COALESCE(
        (SELECT MAX(sale."createdAt") FROM "SaleItem" si JOIN "Sale" sale ON sale.id = si."saleId"
          WHERE si."productId" = p.id AND sale."storeId" = ${Number(storeId)}),
        p."lastSoldSnapshot"
      ) as "lastSoldDate",
      b."purchasePrice",
      b."sellingPrice" as "salesPrice",
      p."boxQty",
      COALESCE(b."stockQty", 0) as "stockQty"
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY p.name ASC
    LIMIT ${size} OFFSET ${offset}
  `;
  const countSql = `SELECT COUNT(*)::int as total ${fromSql} WHERE ${whereSql}`;

  const [rows, countResult] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(dataSql, ...params),
    prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...params),
  ]);

  res.json({ rows, total: countResult[0]?.total || 0, page: pageNum, pageSize: size });
});

router.get('/stock-data/export', requirePermission('stock-data'), async (req, res) => {
  const { storeId, type, dosageForm, generic, departmentId, supplierId, search } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });

  const { whereSql, fromSql, params } = buildStockDataQuery({
    storeId: Number(storeId),
    shopId: req.shop!.id,
    type: type ? String(type) : undefined,
    dosageForm: dosageForm ? String(dosageForm) : undefined,
    generic: generic ? String(generic) : undefined,
    departmentId: departmentId ? String(departmentId) : undefined,
    supplierId: supplierId ? String(supplierId) : undefined,
    search: search ? String(search) : undefined,
  });

  const sql = `
    SELECT
      p."externalCode" as "Item No",
      p.name as "Item Name",
      p."genericName" as "Generic",
      p."displayCategory" as "Display Category",
      d.name as "Department",
      s.name as "Manufacturer",
      COALESCE(
        (SELECT MAX(pr."createdAt") FROM "PurchaseRequisitionItem" pri JOIN "PurchaseRequisition" pr ON pr.id = pri."requisitionId"
          WHERE pri."productId" = p.id AND pr."storeId" = ${Number(storeId)}),
        p."lastPurchaseReqDate"
      ) as "Last Requisition Date",
      COALESCE(
        (SELECT MAX(sale."createdAt") FROM "SaleItem" si JOIN "Sale" sale ON sale.id = si."saleId"
          WHERE si."productId" = p.id AND sale."storeId" = ${Number(storeId)}),
        p."lastSoldSnapshot"
      ) as "Last Sold Date",
      b."purchasePrice" as "Purchase Price",
      b."sellingPrice" as "Sales Price",
      p."boxQty" as "Box Qty",
      COALESCE(b."stockQty", 0) as "Stock Qty"
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY p.name ASC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Data');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="stock-data.xlsx"');
  res.send(buffer);
});

// =======================================================
// EXPIRE PRODUCTS
// =======================================================

type ExpireProductsFilters = {
  storeId: number;
  shopId: number;
  type: 'EXPIRED' | 'EXPIRABLE';
  from?: string;
  to?: string;
  supplierId?: string;
  group?: string;
  generic?: string;
  search?: string;
};

function buildExpireProductsQuery(f: ExpireProductsFilters) {
  const conditions: string[] = ['b."storeId" = $1', 'p."shopId" = $2', 'b."stockQty" > 0'];
  const params: any[] = [f.storeId, f.shopId];
  let idx = 3;
  const push = (cond: string, ...vals: any[]) => {
    let filled = cond;
    for (const val of vals) {
      filled = filled.replace('$N', `$${idx}`);
      params.push(val);
      idx += 1;
    }
    conditions.push(filled);
  };

  if (f.type === 'EXPIRED') {
    conditions.push('b."expiryDate" < NOW()');
  } else {
    push('b."expiryDate" >= $N', new Date(f.from!));
    push('b."expiryDate" <= $N', new Date(f.to!));
  }
  if (f.supplierId) push('p."defaultSupplierId" = $N', Number(f.supplierId));
  if (f.group) push('p."dosageForm" = $N', f.group);
  if (f.generic) push('p."genericName" ILIKE $N', `%${f.generic}%`);
  if (f.search) {
    const term = `%${f.search}%`;
    push('(p."externalCode" ILIKE $N OR p.name ILIKE $N OR p."genericName" ILIKE $N)', term, term, term);
  }

  const whereSql = conditions.join(' AND ');
  const fromSql = `
    FROM "Batch" b
    JOIN "Product" p ON p.id = b."productId"
    LEFT JOIN "Supplier" s ON s.id = p."defaultSupplierId"
  `;

  return { whereSql, fromSql, params };
}

router.get('/expire-products', requirePermission('expire-products'), asyncHandler(async (req, res) => {
  const { storeId, type, from, to, supplierId, group, generic, search, page, pageSize } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });
  if (type !== 'EXPIRED' && type !== 'EXPIRABLE') return res.status(400).json({ error: 'Type is required' });
  if (type === 'EXPIRABLE' && (!from || !to)) {
    return res.status(400).json({ error: 'From Date and To Date are required for Expirable' });
  }

  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(500, Math.max(1, Number(pageSize) || 10));
  const offset = (pageNum - 1) * size;

  const { whereSql, fromSql, params } = buildExpireProductsQuery({
    storeId: Number(storeId),
    shopId,
    type,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    supplierId: supplierId ? String(supplierId) : undefined,
    group: group ? String(group) : undefined,
    generic: generic ? String(generic) : undefined,
    search: search ? String(search) : undefined,
  });

  const dataSql = `
    SELECT
      p."externalCode" as "itemNo",
      p.name as "itemName",
      p."dosageForm" as "group",
      s.name as supplier,
      b.mrp,
      b."purchasePrice" as pp,
      b."stockQty" as "stockQty",
      b."batchNo" as batch,
      b."expiryDate" as "expDate"
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY b."expiryDate" ASC
    LIMIT ${size} OFFSET ${offset}
  `;
  const countSql = `SELECT COUNT(*)::int as total ${fromSql} WHERE ${whereSql}`;

  const [rows, countResult] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(dataSql, ...params),
    prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...params),
  ]);

  res.json({ rows, total: countResult[0]?.total || 0, page: pageNum, pageSize: size });
}));

router.get('/expire-products/export', requirePermission('expire-products'), asyncHandler(async (req, res) => {
  const { storeId, type, from, to, supplierId, group, generic, search } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });
  if (type !== 'EXPIRED' && type !== 'EXPIRABLE') return res.status(400).json({ error: 'Type is required' });
  if (type === 'EXPIRABLE' && (!from || !to)) {
    return res.status(400).json({ error: 'From Date and To Date are required for Expirable' });
  }

  const { whereSql, fromSql, params } = buildExpireProductsQuery({
    storeId: Number(storeId),
    shopId: req.shop!.id,
    type,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    supplierId: supplierId ? String(supplierId) : undefined,
    group: group ? String(group) : undefined,
    generic: generic ? String(generic) : undefined,
    search: search ? String(search) : undefined,
  });

  const sql = `
    SELECT
      p."externalCode" as "Item No",
      p.name as "Item Name",
      p."dosageForm" as "Group",
      s.name as "Supplier",
      b.mrp as "MRP",
      b."purchasePrice" as "PP",
      b."stockQty" as "Stock Qty",
      b."batchNo" as "Batch",
      b."expiryDate" as "Exp. Date"
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY b."expiryDate" ASC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Expire Products');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="expire-products.xlsx"');
  res.send(buffer);
}));

// =======================================================
// SOLD PRODUCT LEDGER
// =======================================================

type SoldLedgerFilters = {
  shopId: number;
  storeId?: string;
  item?: string;
  supplierId?: string;
  custType?: string;
  customerCode?: string;
  mobile?: string;
  employeeId?: string;
  invoiceNo?: string;
  batchNo?: string;
  from?: string;
  to?: string;
};

// SaleItem has no direct FK to the GRN that stocked its batch — traced
// indirectly via product+batchNo+store, matched to the most-recently
// approved GRN (a batch can be topped up by more than one GRN over time,
// so a plain join would fan out into duplicate ledger rows).
function buildSoldLedgerQuery(f: SoldLedgerFilters) {
  const conditions: string[] = ['sale."shopId" = $1'];
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

  if (f.storeId) push('sale."storeId" = $N', Number(f.storeId));
  if (f.item) push('(p.name ILIKE $N OR p."externalCode" ILIKE $N)', `%${f.item}%`, `%${f.item}%`);
  if (f.supplierId) push('p."defaultSupplierId" = $N', Number(f.supplierId));
  if (f.custType) push('c."custType" = $N::"CustomerType"', f.custType);
  if (f.customerCode) push('c."customerCode" ILIKE $N', `%${f.customerCode}%`);
  if (f.mobile) push('c.mobile ILIKE $N', `%${f.mobile}%`);
  if (f.employeeId) push('c."employeeId" ILIKE $N', `%${f.employeeId}%`);
  if (f.invoiceNo) push('sale."invoiceNo" ILIKE $N', `%${f.invoiceNo}%`);
  if (f.batchNo) push('si."batchNoSnapshot" ILIKE $N', `%${f.batchNo}%`);
  if (f.from) push('sale."createdAt" >= $N', new Date(f.from));
  if (f.to) push('sale."createdAt" <= $N', new Date(`${f.to}T23:59:59.999Z`));

  const whereSql = conditions.join(' AND ');
  const fromSql = `
    FROM "SaleItem" si
    JOIN "Sale" sale ON sale.id = si."saleId"
    JOIN "Product" p ON p.id = si."productId"
    JOIN "Store" st ON st.id = sale."storeId"
    LEFT JOIN "Customer" c ON c.id = sale."customerId"
    JOIN "ShopAdmin" ca ON ca.id = sale."cashierId"
    LEFT JOIN LATERAL (
      SELECT g."transactionNo", g."invoiceNo" as "companyInvoiceNo"
      FROM "GrnItem" gi
      JOIN "Grn" g ON g.id = gi."grnId"
      WHERE gi."productId" = si."productId" AND gi."batchNo" = si."batchNoSnapshot"
        AND g."storeId" = sale."storeId" AND g.status = 'APPROVED'
      ORDER BY g."approvedAt" DESC NULLS LAST, g."createdAt" DESC
      LIMIT 1
    ) "grnMatch" ON true
  `;

  return { whereSql, fromSql, params };
}

router.get('/sold-product-ledger', requirePermission('sold-product-ledger'), asyncHandler(async (req, res) => {
  const { storeId, item, supplierId, custType, customerCode, mobile, employeeId, invoiceNo, batchNo, from, to, page, pageSize } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });

  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 10));
  const offset = (pageNum - 1) * size;

  const { whereSql, fromSql, params } = buildSoldLedgerQuery({
    shopId,
    storeId: storeId ? String(storeId) : undefined,
    item: item ? String(item) : undefined,
    supplierId: supplierId ? String(supplierId) : undefined,
    custType: custType ? String(custType) : undefined,
    customerCode: customerCode ? String(customerCode) : undefined,
    mobile: mobile ? String(mobile) : undefined,
    employeeId: employeeId ? String(employeeId) : undefined,
    invoiceNo: invoiceNo ? String(invoiceNo) : undefined,
    batchNo: batchNo ? String(batchNo) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
  });

  const dataSql = `
    SELECT
      st.name as store,
      sale."invoiceNo" as "invoiceNo",
      sale."createdAt" as "invoiceDate",
      c."customerCode" as "customerId",
      c.name as "customerName",
      c.mobile as "contactNo",
      c."custType" as "custType",
      c."employeeId" as "eidPfNo",
      si."productNameSnapshot" as "itemName",
      si."batchNoSnapshot" as "batchNo",
      si.qty as qty,
      si.mrp as mrp,
      (si.mrp * si.qty)::float as "totalValue",
      sale.remarks as remarks,
      si."supplierSnapshot" as company,
      "grnMatch"."transactionNo" as "grnNo",
      "grnMatch"."companyInvoiceNo" as "companyInvoiceNo",
      ca.name as "servedBy"
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY sale."createdAt" DESC
    LIMIT ${size} OFFSET ${offset}
  `;
  const countSql = `SELECT COUNT(*)::int as total ${fromSql} WHERE ${whereSql}`;

  const [rows, countResult] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(dataSql, ...params),
    prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...params),
  ]);

  res.json({ rows, total: countResult[0]?.total || 0, page: pageNum, pageSize: size });
}));

router.get('/sold-product-ledger/export', requirePermission('sold-product-ledger'), asyncHandler(async (req, res) => {
  const { storeId, item, supplierId, custType, customerCode, mobile, employeeId, invoiceNo, batchNo, from, to } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });

  const { whereSql, fromSql, params } = buildSoldLedgerQuery({
    shopId: req.shop!.id,
    storeId: storeId ? String(storeId) : undefined,
    item: item ? String(item) : undefined,
    supplierId: supplierId ? String(supplierId) : undefined,
    custType: custType ? String(custType) : undefined,
    customerCode: customerCode ? String(customerCode) : undefined,
    mobile: mobile ? String(mobile) : undefined,
    employeeId: employeeId ? String(employeeId) : undefined,
    invoiceNo: invoiceNo ? String(invoiceNo) : undefined,
    batchNo: batchNo ? String(batchNo) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
  });

  const sql = `
    SELECT
      st.name as "Store",
      sale."invoiceNo" as "Invoice No",
      sale."createdAt" as "Invoice Date",
      c."customerCode" as "Customer ID",
      c.name as "Customer Name",
      c.mobile as "Contact No",
      c."custType" as "Customer Type",
      c."employeeId" as "EID/PF No",
      si."productNameSnapshot" as "Item Name",
      si."batchNoSnapshot" as "Batch No",
      si.qty as "Qty",
      si.mrp as "MRP",
      (si.mrp * si.qty)::float as "Total Value",
      sale.remarks as "Remarks",
      si."supplierSnapshot" as "Company",
      "grnMatch"."transactionNo" as "GRN No",
      "grnMatch"."companyInvoiceNo" as "Company Invoice No",
      ca.name as "Served By"
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY sale."createdAt" DESC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sold Product Ledger');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="sold-product-ledger.xlsx"');
  res.send(buffer);
}));

export default router;
