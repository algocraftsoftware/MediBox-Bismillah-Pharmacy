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

// The three lookup endpoints below feed the identical filter panel on both
// Stock Data and Edit Stock, so either permission opens them.
router.get('/products/dosage-forms', requirePermission('stock-data', 'edit-stock', 'create-stock'), async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { shopId: req.shop!.id, dosageForm: { not: null } },
    select: { dosageForm: true },
    distinct: ['dosageForm'],
    orderBy: { dosageForm: 'asc' },
  });
  res.json(rows.map((r) => r.dosageForm));
});

// Distinct Display Category values already in use, so Create Stock can offer
// them as a picklist instead of letting a typo invent a near-duplicate
// category that then splits the Stock Data filter.
router.get('/products/display-categories', requirePermission('stock-data', 'edit-stock', 'create-stock'), async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { shopId: req.shop!.id, displayCategory: { not: null } },
    select: { displayCategory: true },
    distinct: ['displayCategory'],
    orderBy: { displayCategory: 'asc' },
  });
  res.json(rows.map((r) => r.displayCategory));
});

// Units of measure already in use (Pcs, BOT, BOX, SACH, ...) for the Create
// Stock UOM picker — the same Product.unit that every other screen shows as
// "UOM"/"uom", so a new item measures in something the rest of the app knows.
router.get('/products/units', requirePermission('stock-data', 'edit-stock', 'create-stock'), async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { shopId: req.shop!.id },
    select: { unit: true },
    distinct: ['unit'],
    orderBy: { unit: 'asc' },
  });
  res.json(rows.map((r) => r.unit).filter(Boolean));
});

router.get('/products/generics', requirePermission('stock-data', 'edit-stock', 'create-stock'), async (req, res) => {
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
router.get('/products/stock-search-suggest', requirePermission('stock-data', 'edit-stock'), asyncHandler(async (req, res) => {
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

// The grid's column list, shared verbatim by Stock Data and Edit Stock so the
// two screens can never drift apart. `identityColumns` carries the productId /
// batchId Edit Stock needs to aim a save at the exact row being shown — Stock
// Data is read-only and doesn't select them.
//
// storeId is interpolated (not bound) because it appears inside correlated
// subqueries that the shared $N parameter numbering in buildStockDataQuery
// doesn't cover; every caller passes it through Number.isInteger first.
function stockGridColumnsSql(storeId: number, identityColumns = '') {
  return `
      ${identityColumns}
      p."externalCode" as "itemNo",
      p.name as "itemName",
      p."genericName",
      p."displayCategory",
      d.name as department,
      s.name as manufacturer,
      COALESCE(
        (SELECT MAX(pr."createdAt") FROM "PurchaseRequisitionItem" pri JOIN "PurchaseRequisition" pr ON pr.id = pri."requisitionId"
          WHERE pri."productId" = p.id AND pr."storeId" = ${storeId}),
        p."lastPurchaseReqDate"
      ) as "lastPurchaseReqDate",
      COALESCE(
        (SELECT MAX(sale."createdAt") FROM "SaleItem" si JOIN "Sale" sale ON sale.id = si."saleId"
          WHERE si."productId" = p.id AND sale."storeId" = ${storeId}),
        p."lastSoldSnapshot"
      ) as "lastSoldDate",
      b."purchasePrice",
      b."sellingPrice" as "salesPrice",
      p."boxQty",
      COALESCE(b."stockQty", 0) as "stockQty"
  `;
}

// Same columns as stockGridColumnsSql but aliased to the spreadsheet headers —
// shared by the Stock Data and Edit Stock XLSX exports.
function stockGridExportColumnsSql(storeId: number) {
  return `
      p."externalCode" as "Item No",
      p.name as "Item Name",
      p."genericName" as "Generic",
      p."displayCategory" as "Display Category",
      d.name as "Department",
      s.name as "Manufacturer",
      COALESCE(
        (SELECT MAX(pr."createdAt") FROM "PurchaseRequisitionItem" pri JOIN "PurchaseRequisition" pr ON pr.id = pri."requisitionId"
          WHERE pri."productId" = p.id AND pr."storeId" = ${storeId}),
        p."lastPurchaseReqDate"
      ) as "Last Requisition Date",
      COALESCE(
        (SELECT MAX(sale."createdAt") FROM "SaleItem" si JOIN "Sale" sale ON sale.id = si."saleId"
          WHERE si."productId" = p.id AND sale."storeId" = ${storeId}),
        p."lastSoldSnapshot"
      ) as "Last Sold Date",
      b."purchasePrice" as "Purchase Price",
      b."sellingPrice" as "Sales Price",
      p."boxQty" as "Box Qty",
      COALESCE(b."stockQty", 0) as "Stock Qty"
  `;
}

router.get('/stock-data', requirePermission('stock-data'), async (req, res) => {
  const { storeId, type, dosageForm, generic, departmentId, supplierId, search, page, pageSize } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });
  if (!Number.isInteger(Number(storeId))) return res.status(400).json({ error: 'Invalid Warehouse' });

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
    ${stockGridColumnsSql(Number(storeId))}
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
  if (!Number.isInteger(Number(storeId))) return res.status(400).json({ error: 'Invalid Warehouse' });

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
    ${stockGridExportColumnsSql(Number(storeId))}
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
// EDIT STOCK
//
// The Stock Data grid again — identical filters, columns and export — but
// writable: Display Category, Purchase Price, Sales Price and Box Qty can be
// edited straight in the grid and saved back to the catalog. Reuses
// buildStockDataQuery and the shared column lists above so the two screens
// show exactly the same rows.
//
// The two halves of a row live in different tables, which decides the scope of
// each edit: Display Category and Box Qty are Product columns (catalog-wide,
// every warehouse), while Purchase Price and Sales Price are Batch columns
// (only the batch shown in the selected warehouse's row).
// =======================================================

// A page of the grid is 10 rows, so a realistic save is tiny; the cap only
// exists to keep one request from opening an unbounded transaction.
const MAX_EDIT_STOCK_UPDATES = 200;

type EditStockParsed = {
  productId: number;
  batchId: number | null;
  productData: { displayCategory?: string | null; boxQty?: number };
  batchData: { purchasePrice?: number; sellingPrice?: number };
};

router.get('/edit-stock', requirePermission('edit-stock'), asyncHandler(async (req, res) => {
  const { storeId, type, dosageForm, generic, departmentId, supplierId, search, page, pageSize } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });
  const sid = Number(storeId);
  if (!Number.isInteger(sid)) return res.status(400).json({ error: 'Invalid Warehouse' });

  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(500, Math.max(1, Number(pageSize) || 50));
  const offset = (pageNum - 1) * size;

  const { whereSql, fromSql, params } = buildStockDataQuery({
    storeId: sid,
    shopId,
    type: type ? String(type) : undefined,
    dosageForm: dosageForm ? String(dosageForm) : undefined,
    generic: generic ? String(generic) : undefined,
    departmentId: departmentId ? String(departmentId) : undefined,
    supplierId: supplierId ? String(supplierId) : undefined,
    search: search ? String(search) : undefined,
  });

  // Fully deterministic ordering (Stock Data sorts on name alone) — a product
  // with several batches in one warehouse yields one row per batch, and rows
  // being edited must not shuffle between the read and the save that follows it.
  const dataSql = `
    SELECT
    ${stockGridColumnsSql(sid, 'p.id as "productId", b.id as "batchId",')}
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY p.name ASC, p.id ASC, b.id ASC
    LIMIT ${size} OFFSET ${offset}
  `;
  const countSql = `SELECT COUNT(*)::int as total ${fromSql} WHERE ${whereSql}`;

  const [rows, countResult] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(dataSql, ...params),
    prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...params),
  ]);

  res.json({ rows, total: countResult[0]?.total || 0, page: pageNum, pageSize: size });
}));

router.get('/edit-stock/export', requirePermission('edit-stock'), asyncHandler(async (req, res) => {
  const { storeId, type, dosageForm, generic, departmentId, supplierId, search } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId (Warehouse) is required' });
  const sid = Number(storeId);
  if (!Number.isInteger(sid)) return res.status(400).json({ error: 'Invalid Warehouse' });

  const { whereSql, fromSql, params } = buildStockDataQuery({
    storeId: sid,
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
    ${stockGridExportColumnsSql(sid)}
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY p.name ASC, p.id ASC, b.id ASC
  `;
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Edit Stock');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="edit-stock.xlsx"');
  res.send(buffer);
}));

// Bulk save for the grid — one request carries every edited row on the page, so
// a page of edits either lands completely or not at all.
router.patch('/edit-stock', requirePermission('edit-stock'), asyncHandler(async (req, res) => {
  const { storeId, updates } = req.body || {};
  const sid = Number(storeId);
  if (!Number.isInteger(sid)) return res.status(400).json({ error: 'storeId (Warehouse) is required' });
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'No changes to save' });
  }
  if (updates.length > MAX_EDIT_STOCK_UPDATES) {
    return res.status(400).json({ error: `Too many rows in one save (max ${MAX_EDIT_STOCK_UPDATES})` });
  }

  const shopId = req.shop!.id;

  // The warehouse itself must belong to this shop, or a price edit could be
  // aimed at another shop's store id.
  const store = await prisma.store.findFirst({ where: { id: sid, shopId } });
  if (!store) return res.status(404).json({ error: 'Warehouse not found' });

  const parsed: EditStockParsed[] = [];
  for (const raw of updates) {
    const productId = Number(raw?.productId);
    if (!Number.isInteger(productId)) return res.status(400).json({ error: 'Invalid productId in the submitted rows' });

    const batchId = raw?.batchId === null || raw?.batchId === undefined ? null : Number(raw.batchId);
    if (batchId !== null && !Number.isInteger(batchId)) {
      return res.status(400).json({ error: 'Invalid batchId in the submitted rows' });
    }

    const productData: EditStockParsed['productData'] = {};
    const batchData: EditStockParsed['batchData'] = {};

    if (raw.displayCategory !== undefined) {
      const text = raw.displayCategory === null ? '' : String(raw.displayCategory).trim();
      if (text.length > 191) return res.status(400).json({ error: 'Display Category is too long (max 191 characters)' });
      // Cleared cell means "no category" rather than an empty string, matching
      // the nullable column every other screen reads.
      productData.displayCategory = text === '' ? null : text;
    }

    if (raw.boxQty !== undefined) {
      const qty = Number(raw.boxQty);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ error: 'Box Qty must be a whole number of 1 or more' });
      }
      productData.boxQty = qty;
    }

    // Prices are Float columns; rounding to paisa here keeps what the grid
    // shows (2dp) and what the DB stores identical.
    if (raw.purchasePrice !== undefined) {
      const price = Number(raw.purchasePrice);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'Purchase Price must be a number of 0 or more' });
      }
      batchData.purchasePrice = Math.round(price * 100) / 100;
    }

    if (raw.salesPrice !== undefined) {
      const price = Number(raw.salesPrice);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'Sales Price must be a number of 0 or more' });
      }
      batchData.sellingPrice = Math.round(price * 100) / 100;
    }

    const hasBatchEdit = Object.keys(batchData).length > 0;
    if (hasBatchEdit && batchId === null) {
      return res.status(400).json({
        error:
          'Purchase Price and Sales Price live on a batch — this item has no batch in the selected warehouse yet, so receive it through a GRN first.',
      });
    }
    if (Object.keys(productData).length === 0 && !hasBatchEdit) continue;

    parsed.push({ productId, batchId, productData, batchData });
  }

  if (parsed.length === 0) return res.status(400).json({ error: 'No changes to save' });

  // Every targeted product must be this shop's, and every targeted batch must
  // belong to that same product in the selected warehouse.
  const productIds = [...new Set(parsed.map((u) => u.productId))];
  const ownedProducts = await prisma.product.findMany({
    where: { id: { in: productIds }, shopId },
    select: { id: true },
  });
  if (ownedProducts.length !== productIds.length) {
    return res.status(404).json({ error: 'One or more items were not found in this shop' });
  }

  const batchIds = [...new Set(parsed.filter((u) => u.batchId !== null).map((u) => u.batchId as number))];
  if (batchIds.length > 0) {
    const ownedBatches = await prisma.batch.findMany({
      where: { id: { in: batchIds }, storeId: sid, product: { shopId } },
      select: { id: true, productId: true },
    });
    const productIdByBatch = new Map(ownedBatches.map((b) => [b.id, b.productId]));
    for (const u of parsed) {
      if (u.batchId === null) continue;
      const owner = productIdByBatch.get(u.batchId);
      if (owner === undefined) {
        return res.status(404).json({ error: 'One or more batches were not found in the selected warehouse' });
      }
      if (owner !== u.productId) {
        return res.status(400).json({ error: 'A submitted batch does not belong to its item' });
      }
    }
  }

  let productsUpdated = 0;
  let batchesUpdated = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const u of parsed) {
        if (Object.keys(u.productData).length > 0) {
          await tx.product.update({ where: { id: u.productId }, data: u.productData });
          productsUpdated += 1;
        }
        if (u.batchId !== null && Object.keys(u.batchData).length > 0) {
          await tx.batch.update({ where: { id: u.batchId }, data: u.batchData });
          batchesUpdated += 1;
        }
      }
    },
    { timeout: 30000, maxWait: 10000 },
  );

  res.json({ ok: true, rowsUpdated: parsed.length, productsUpdated, batchesUpdated });
}));

// =======================================================
// CREATE STOCK
//
// Adds a brand-new item to the catalog by hand, with the same fields the Stock
// Data grid shows. Item No is never typed — it continues the shop's own
// numbering (see nextItemNo) — and Last Req./Last Sold Date are history, so
// they start empty and fill themselves in from real requisitions and sales.
//
// A new item gets one reference Batch in the chosen warehouse, exactly like the
// ones catalogClone lays down for the imported catalog: it's what carries
// Purchase Price / Sales Price, both of which live on Batch rather than
// Product, and it's what makes the item immediately usable everywhere else
// (Stock Data, Edit Stock, Billing, GRN).
//
// That batch always opens at ZERO stock and is never given a real expiry date.
// Creating an item is a catalog entry, not a receipt of goods — physical
// quantity (and the batch number and expiry that come with it) arrives through
// GRN With PO / GRN Without PO, which add their own batch and increment stock
// on approval. There is deliberately no way to type an opening quantity here.
// =======================================================

// Used only when a shop has no coded products at all to continue from.
const FIRST_ITEM_NO = 'APH100001';

// The next Item No in this shop's own sequence: take the highest numeric tail
// in use, add one, and keep that number's width and prefix. This shop's catalog
// runs APH100001..APH113580 and then APH100113581..APH100117251 — two different
// widths — so anchoring on the numerically highest code (rather than a
// particular format) continues the live sequence and can't collide with either
// family. A shop that numbers its items some other way is followed just as well.
async function nextItemNo(shopId: number): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ code: string }[]>(
    `SELECT "externalCode" AS code
     FROM "Product"
     WHERE "shopId" = $1 AND "externalCode" ~ '^[A-Za-z-]*[0-9]+$'
     ORDER BY (regexp_replace("externalCode", '^[A-Za-z-]*', ''))::bigint DESC
     LIMIT 1`,
    shopId,
  );
  const latest = rows[0]?.code;
  const parts = latest ? /^([A-Za-z-]*)(\d+)$/.exec(latest) : null;
  if (!parts) return FIRST_ITEM_NO;
  const [, prefix, digits] = parts;
  return `${prefix}${(BigInt(digits) + 1n).toString().padStart(digits.length, '0')}`;
}

// Reference batches for the imported catalog are stamped OPEN-<itemNo> with the
// item code as the barcode; a hand-created item follows the same convention so
// its opening row is recognisable next to them.
const openingBatchNo = (itemNo: string) => `OPEN-${itemNo}`;

// Batch.expiryDate is required by the schema, but a zero-quantity opening row
// for goods that were never physically received has no real expiry to state —
// the dated batches come from GRN. The imported catalog's own reference batches
// sit two years out, so this placeholder follows the same convention.
function defaultOpeningExpiry(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d;
}

router.get('/create-stock/next-item-no', requirePermission('create-stock'), asyncHandler(async (req, res) => {
  res.json({ itemNo: await nextItemNo(req.shop!.id) });
}));

router.post('/create-stock', requirePermission('create-stock'), asyncHandler(async (req, res) => {
  const {
    storeId,
    name,
    genericName,
    displayCategory,
    departmentId,
    subDepartmentId,
    supplierId,
    // "Item Type" on the form. Same Product.dosageForm the Stock Data filter
    // calls "Dosage" — it's the import's ITEM TYPE NAME column.
    dosageForm,
    unit,
    reorderLevel,
    boxQty,
    purchasePrice,
    salesPrice,
  } = req.body || {};

  const shopId = req.shop!.id;

  const itemName = String(name ?? '').trim();
  if (!itemName) return res.status(400).json({ error: 'Item Name is required' });
  if (itemName.length > 191) return res.status(400).json({ error: 'Item Name is too long (max 191 characters)' });

  const sid = Number(storeId);
  if (!Number.isInteger(sid)) return res.status(400).json({ error: 'Warehouse is required' });
  const store = await prisma.store.findFirst({ where: { id: sid, shopId } });
  if (!store) return res.status(404).json({ error: 'Warehouse not found' });

  const deptId = Number(departmentId);
  if (!Number.isInteger(deptId)) return res.status(400).json({ error: 'Department is required' });
  const department = await prisma.department.findFirst({ where: { id: deptId, shopId } });
  if (!department) return res.status(404).json({ error: 'Department not found' });

  // A sub-department has to sit under the department that was picked, or the
  // item would file itself under a mismatched pair.
  let subDeptId: number | null = null;
  if (subDepartmentId !== undefined && subDepartmentId !== null && subDepartmentId !== '') {
    subDeptId = Number(subDepartmentId);
    if (!Number.isInteger(subDeptId)) return res.status(400).json({ error: 'Invalid Sub-Department' });
    const sub = await prisma.subDepartment.findFirst({ where: { id: subDeptId, departmentId: deptId } });
    if (!sub) return res.status(400).json({ error: 'That Sub-Department does not belong to the selected Department' });
  }

  let defaultSupplierId: number | null = null;
  if (supplierId !== undefined && supplierId !== null && supplierId !== '') {
    defaultSupplierId = Number(supplierId);
    if (!Number.isInteger(defaultSupplierId)) return res.status(400).json({ error: 'Invalid Manufacturer' });
    const supplier = await prisma.supplier.findFirst({ where: { id: defaultSupplierId, shopId } });
    if (!supplier) return res.status(404).json({ error: 'Manufacturer not found' });
  }

  const box = boxQty === undefined || boxQty === null || boxQty === '' ? 1 : Number(boxQty);
  if (!Number.isInteger(box) || box < 1) {
    return res.status(400).json({ error: 'Box Qty must be a whole number of 1 or more' });
  }

  const parsePrice = (value: unknown) => {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    // Money is stored as a Float — round to paisa so the grid and DB agree,
    // same as Edit Stock.
    return Math.round(n * 100) / 100;
  };
  const pp = parsePrice(purchasePrice);
  if (pp === null) return res.status(400).json({ error: 'Purchase Price must be a number of 0 or more' });
  const sp = parsePrice(salesPrice);
  if (sp === null) return res.status(400).json({ error: 'Sales Price must be a number of 0 or more' });

  const rol =
    reorderLevel === undefined || reorderLevel === null || reorderLevel === '' ? 0 : Number(reorderLevel);
  if (!Number.isInteger(rol) || rol < 0) {
    return res.status(400).json({ error: 'Re-order Level must be a whole number of 0 or more' });
  }

  // Unit is NOT NULL with a "Pcs" default on Product; an empty box falls back
  // to that rather than storing a blank UOM that reads as missing everywhere.
  const uom = String(unit ?? '').trim() || 'Pcs';
  if (uom.length > 32) return res.status(400).json({ error: 'UOM is too long (max 32 characters)' });

  const category = String(displayCategory ?? '').trim();
  const generic = String(genericName ?? '').trim();
  const dosage = String(dosageForm ?? '').trim();

  // Two people adding an item at the same moment would both read the same
  // "next" code, and the second insert then trips the (shopId, externalCode)
  // unique index — so re-read and retry rather than failing the entry.
  const MAX_ITEM_NO_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ITEM_NO_ATTEMPTS; attempt += 1) {
    const itemNo = await nextItemNo(shopId);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            shopId,
            name: itemName,
            genericName: generic,
            departmentId: deptId,
            subDepartmentId: subDeptId,
            defaultSupplierId,
            displayCategory: category || null,
            externalCode: itemNo,
            boxQty: box,
            unit: uom,
            reorderLevel: rol,
            dosageForm: dosage || null,
          },
        });
        const batch = await tx.batch.create({
          data: {
            productId: product.id,
            storeId: sid,
            batchNo: openingBatchNo(itemNo),
            barcode: itemNo,
            expiryDate: defaultOpeningExpiry(),
            // The imported catalog's reference rows carry MRP == Sales Price;
            // Billing prices off sellingPrice, so both take the entered figure.
            mrp: sp,
            purchasePrice: pp,
            sellingPrice: sp,
            // Always zero — see the section header. Stock arrives via GRN.
            stockQty: 0,
          },
        });
        return { product, batch };
      });

      return res.status(201).json({
        productId: created.product.id,
        batchId: created.batch.id,
        itemNo,
        itemName: created.product.name,
        genericName: created.product.genericName,
        displayCategory: created.product.displayCategory,
        department: department.name,
        itemType: created.product.dosageForm,
        unit: created.product.unit,
        reorderLevel: created.product.reorderLevel,
        boxQty: created.product.boxQty,
        purchasePrice: created.batch.purchasePrice,
        salesPrice: created.batch.sellingPrice,
        stockQty: created.batch.stockQty,
      });
    } catch (err: any) {
      const isCodeClash = err?.code === 'P2002' && String(err?.meta?.target ?? '').includes('externalCode');
      if (!isCodeClash || attempt === MAX_ITEM_NO_ATTEMPTS) throw err;
    }
  }

  return res.status(409).json({ error: 'Could not allocate an Item No — please try again' });
}));

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
