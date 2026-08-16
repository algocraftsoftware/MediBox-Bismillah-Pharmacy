import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('purchase-requisition'));

export const adminSelect = { id: true, name: true, username: true, role: true } as const;

// =======================================================
// BULK ITEM GRID — every product from a supplier, with live
// stock/pricing (store-scoped) and consumption over N days.
// =======================================================

router.get('/items', asyncHandler(async (req, res) => {
  const { storeId, supplierId, mode, days, reorderBelow, search, page, pageSize } = req.query;
  if (!storeId || !supplierId) {
    return res.status(400).json({ error: 'storeId and supplierId are required' });
  }

  const shopId = req.shop!.id;
  const consumptionDays = Math.max(1, Number(days) || 30);
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(3000, Math.max(1, Number(pageSize) || 50));
  const offset = (pageNum - 1) * size;

  const conditions: string[] = ['p."shopId" = $1', 'p."defaultSupplierId" = $2'];
  const params: any[] = [shopId, Number(supplierId)];
  let idx = 3;

  // Not WHERE-clause conditions — just parameters referenced in the JOINs
  // below. Allocated up front so conditions built below (e.g. reorderBelow's
  // GRN-history check) can already reference storeIdParam.
  const storeIdParam = `$${idx}`;
  params.push(Number(storeId));
  idx += 1;
  const sinceParam = `$${idx}`;
  params.push(new Date(Date.now() - consumptionDays * 24 * 3600 * 1000));
  idx += 1;

  if (mode === 'PHARMA') conditions.push(`d.name = 'Pharma'`);
  else if (mode === 'NON_PHARMA') conditions.push(`d.name = 'Non-Pharma'`);
  if (reorderBelow === 'true') {
    // "Reorder Below" only ever lists products this store has actually
    // received (and had approved) via GRN at least once — a product that
    // has never been stocked here isn't "below reorder level", it simply
    // has no stock history yet.
    conditions.push('COALESCE(b."stockQty", 0) <= p."reorderLevel"');
    conditions.push(`EXISTS (
      SELECT 1 FROM "GrnItem" gi
      JOIN "Grn" g ON g.id = gi."grnId"
      WHERE gi."productId" = p.id AND g."storeId" = ${storeIdParam} AND g.status = 'APPROVED'
    )`);
  }
  if (search) {
    const term = `%${search}%`;
    conditions.push(`(p."externalCode" ILIKE $${idx} OR p.name ILIKE $${idx + 1})`);
    params.push(term, term);
    idx += 2;
  }

  const whereSql = conditions.join(' AND ');

  // Pricing (PP/MRP) prefers this store's own batch, but a store that has
  // never received a product via GRN yet (e.g. a brand-new branch) has no
  // batch row at all — fall back to the product's most recent batch from
  // any store in the shop so a first-ever requisition still prices
  // correctly instead of showing zeroes.
  const sql = `
    SELECT
      p.id as "productId",
      p."externalCode" as "itemCode",
      p.name as "itemName",
      p."genericName",
      p.unit as uom,
      p."boxQty" as "packSize",
      p."reorderLevel" as rol,
      COALESCE(b."stockQty", 0) as qoh,
      COALESCE(b."purchasePrice", "bAny"."purchasePrice", 0)::float as "ppPerPiece",
      COALESCE(b.mrp, "bAny".mrp, 0)::float as "mrpPerPiece",
      COALESCE(cons.consumed, 0)::float as "consumptionPieces"
    FROM "Product" p
    JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN "Batch" b ON b."productId" = p.id AND b."storeId" = ${storeIdParam}
    LEFT JOIN LATERAL (
      SELECT b2."purchasePrice", b2.mrp
      FROM "Batch" b2
      WHERE b2."productId" = p.id
      ORDER BY b2."createdAt" DESC
      LIMIT 1
    ) "bAny" ON true
    LEFT JOIN LATERAL (
      SELECT SUM(si.qty)::float as consumed
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE si."productId" = p.id AND s."storeId" = ${storeIdParam} AND s."createdAt" >= ${sinceParam}
    ) cons ON true
    WHERE ${whereSql}
    ORDER BY p.name ASC
    LIMIT ${size} OFFSET ${offset}
  `;
  const countSql = `
    SELECT COUNT(*)::int as total
    FROM "Product" p
    JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN "Batch" b ON b."productId" = p.id AND b."storeId" = ${storeIdParam}
    WHERE ${whereSql}
  `;

  const [rows, countResult] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(sql, ...params),
    prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...params),
  ]);

  const withCalc = rows.map((r) => {
    const consumptionBox = r.packSize > 0 ? r.consumptionPieces / r.packSize : 0;
    const gp = r.mrpPerPiece - r.ppPerPiece;
    const gpPct = r.mrpPerPiece > 0 ? (gp / r.mrpPerPiece) * 100 : 0;
    return { ...r, consumptionBox, gp, gpPct };
  });

  res.json({ rows: withCalc, total: countResult[0]?.total || 0, page: pageNum, pageSize: size });
}));

// =======================================================
// LIST / DETAIL
// =======================================================

router.get('/', asyncHandler(async (req, res) => {
  const { type, status, storeId, supplierId, mode, search, page, pageSize } = req.query;
  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  const where: any = { shopId };
  if (type) where.type = String(type);
  if (status) where.status = String(status);
  if (storeId) where.storeId = Number(storeId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (mode) where.mode = String(mode);
  if (search) where.requisitionNo = { contains: String(search), mode: 'insensitive' };

  const [rows, total] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where,
      include: { store: true, supplier: true, createdBy: { select: adminSelect }, approvedBy: { select: adminSelect } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.purchaseRequisition.count({ where }),
  ]);

  res.json({ rows, total, page: pageNum, pageSize: size });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid requisition id' });
  const requisition = await prisma.purchaseRequisition.findFirst({
    where: { id, shopId: req.shop!.id },
    include: {
      store: true,
      supplier: true,
      createdBy: { select: adminSelect },
      approvedBy: { select: adminSelect },
      items: { include: { product: true } },
    },
  });
  if (!requisition) return res.status(404).json({ error: 'Requisition not found' });
  res.json(requisition);
}));

// =======================================================
// CREATE / UPDATE / APPROVE
// =======================================================

export type ItemInput = { productId: number; qtyBox?: number; qtyPieces?: number; remarks?: string };

export async function priceItems(shopId: number, storeId: number, items: ItemInput[]) {
  const productIds = items.map((i) => Number(i.productId));
  const [products, batches, anyStoreBatches] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds }, shopId } }),
    prisma.batch.findMany({ where: { productId: { in: productIds }, storeId } }),
    // Fallback pricing for a store that has never received a product via
    // GRN — mirrors the /items grid's cross-store price fallback so a
    // first-ever requisition for a new store still prices correctly.
    prisma.batch.findMany({ where: { productId: { in: productIds } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const batchByProductId = new Map(batches.map((b) => [b.productId, b]));
  const anyBatchByProductId = new Map<number, (typeof anyStoreBatches)[number]>();
  for (const b of anyStoreBatches) {
    if (!anyBatchByProductId.has(b.productId)) anyBatchByProductId.set(b.productId, b);
  }

  return items
    .filter((i) => productById.has(Number(i.productId)))
    .map((i) => {
      const product = productById.get(Number(i.productId))!;
      const batch = batchByProductId.get(product.id) || anyBatchByProductId.get(product.id);
      const ppPerPiece = batch?.purchasePrice || 0;
      const mrpPerPiece = batch?.mrp || 0;
      // Item Qty(Box) and Item Qty(Pcs) mirror the same quantity (kept in
      // sync client-side via the product's box size), not two amounts to
      // add together — qtyPieces is the single source of truth.
      const qtyBox = Math.max(0, Number(i.qtyBox) || 0);
      const qtyPieces = Math.max(0, Number(i.qtyPieces) || 0);
      const totalValue = ppPerPiece * qtyPieces;
      const gp = mrpPerPiece - ppPerPiece;
      const gpPct = mrpPerPiece > 0 ? (gp / mrpPerPiece) * 100 : 0;
      return {
        productId: product.id,
        qtyBox,
        qtyPieces,
        ppPerPiece,
        mrpPerPiece,
        totalValue,
        gp,
        gpPct,
        remarks: i.remarks || null,
      };
    });
}

router.post('/', asyncHandler(async (req, res) => {
  const { storeId, deliverTo, supplierId, mode, type, consumptionDays, reorderBelowOnly, remarks, items } =
    req.body || {};

  if (!storeId || !deliverTo || !supplierId || !mode || !Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: 'Store, Deliver To, Supplier, Requisition Mode, and at least one item are required' });
  }

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });

  const pricedItems = await priceItems(shopId, Number(storeId), items);
  const validItems = pricedItems.filter((i) => i.qtyBox > 0 || i.qtyPieces > 0);
  if (validItems.length === 0) {
    return res.status(400).json({ error: 'At least one item must have a requested quantity' });
  }

  const totalPPAmount = validItems.reduce((acc, i) => acc + i.totalValue, 0);
  const totalMrpAmount = validItems.reduce((acc, i) => acc + i.mrpPerPiece * i.qtyPieces, 0);
  const avgGpPct = validItems.reduce((acc, i) => acc + i.gpPct, 0) / validItems.length;

  const requisition = await prisma.$transaction(
    async (tx) => {
      const counter = await tx.requisitionCounter.upsert({
        where: { shopId },
        update: { value: { increment: 1 } },
        create: { shopId, value: 1 },
      });
      const requisitionNo = `PR-${new Date().getFullYear()}-${String(counter.value).padStart(5, '0')}`;

      return tx.purchaseRequisition.create({
        data: {
          shopId,
          storeId: Number(storeId),
          deliverTo: String(deliverTo),
          supplierId: Number(supplierId),
          requisitionNo,
          mode,
          type: type || 'REGULAR',
          consumptionDays: Number(consumptionDays) || 30,
          reorderBelowOnly: Boolean(reorderBelowOnly),
          createdById: req.auth!.sub as number,
          remarks: remarks || null,
          totalPPAmount,
          totalMrpAmount,
          avgGpPct,
          items: { create: validItems },
        },
        include: { store: true, supplier: true, createdBy: { select: adminSelect }, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.status(201).json(requisition);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid requisition id' });
  const shopId = req.shop!.id;
  const existing = await prisma.purchaseRequisition.findFirst({ where: { id, shopId } });
  if (!existing) return res.status(404).json({ error: 'Requisition not found' });
  if (existing.status !== 'UNAPPROVED') {
    return res.status(400).json({ error: 'An approved requisition can no longer be edited' });
  }

  const { storeId, deliverTo, supplierId, mode, type, consumptionDays, reorderBelowOnly, remarks, items } =
    req.body || {};
  const targetStoreId = storeId ? Number(storeId) : existing.storeId;

  const pricedItems = Array.isArray(items) ? await priceItems(shopId, targetStoreId, items) : [];
  const validItems = pricedItems.filter((i) => i.qtyBox > 0 || i.qtyPieces > 0);

  const totalPPAmount = validItems.reduce((acc, i) => acc + i.totalValue, 0);
  const totalMrpAmount = validItems.reduce((acc, i) => acc + i.mrpPerPiece * i.qtyPieces, 0);
  const avgGpPct = validItems.length ? validItems.reduce((acc, i) => acc + i.gpPct, 0) / validItems.length : 0;

  const updated = await prisma.$transaction(
    async (tx) => {
      if (Array.isArray(items)) {
        await tx.purchaseRequisitionItem.deleteMany({ where: { requisitionId: id } });
      }
      return tx.purchaseRequisition.update({
        where: { id },
        data: {
          ...(storeId ? { storeId: targetStoreId } : {}),
          ...(deliverTo ? { deliverTo: String(deliverTo) } : {}),
          ...(supplierId ? { supplierId: Number(supplierId) } : {}),
          ...(mode ? { mode } : {}),
          ...(type ? { type } : {}),
          ...(consumptionDays ? { consumptionDays: Number(consumptionDays) } : {}),
          ...(reorderBelowOnly !== undefined ? { reorderBelowOnly: Boolean(reorderBelowOnly) } : {}),
          ...(remarks !== undefined ? { remarks: remarks || null } : {}),
          ...(Array.isArray(items) ? { totalPPAmount, totalMrpAmount, avgGpPct, items: { create: validItems } } : {}),
        },
        include: { store: true, supplier: true, createdBy: { select: adminSelect }, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.json(updated);
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid requisition id' });
  const existing = await prisma.purchaseRequisition.findFirst({ where: { id, shopId: req.shop!.id } });
  if (!existing) return res.status(404).json({ error: 'Requisition not found' });
  if (existing.status !== 'UNAPPROVED') {
    const current = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: { store: true, supplier: true, createdBy: { select: adminSelect }, approvedBy: { select: adminSelect }, items: { include: { product: true } } },
    });
    return res.json(current);
  }

  const updated = await prisma.purchaseRequisition.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: req.auth!.sub as number, approvedAt: new Date() },
    include: { store: true, supplier: true, createdBy: { select: adminSelect }, approvedBy: { select: adminSelect }, items: { include: { product: true } } },
  });
  res.json(updated);
}));

export default router;
