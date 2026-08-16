import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { adminSelect } from './purchaseRequisitionRoutes';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('virtual-stock-transfer'));

const vstInclude = {
  store: true,
  supplier: true,
  createdBy: { select: adminSelect },
  approvedBy: { select: adminSelect },
} as const;

// =======================================================
// STAGING-ROW SEARCH — one row per batch (not per product),
// deliberately not filtered on expiryDate (VST's whole point
// is surfacing expired/damaged stock, unlike Billing's search).
// =======================================================

router.get('/search-items', asyncHandler(async (req, res) => {
  const { storeId, supplierId, q } = req.query;
  if (!storeId || !supplierId) return res.status(400).json({ error: 'storeId and supplierId are required' });
  if (!q || String(q).trim().length < 2) return res.json([]);

  const shopId = req.shop!.id;
  const term = `%${String(q)}%`;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      p.id as "productId",
      p."externalCode" as "itemCode",
      p.name as "itemName",
      p."dosageForm" as "dosageForm",
      p.unit as uom,
      p."boxQty" as "packSize",
      b."batchNo" as "batchNo",
      b."expiryDate" as "expiryDate",
      b."purchasePrice"::float as "ppPerPiece",
      b.mrp::float as "mrpPerPiece",
      b."stockQty" as "existingQoh"
    FROM "Batch" b
    JOIN "Product" p ON p.id = b."productId"
    WHERE b."storeId" = $1 AND p."shopId" = $2 AND p."defaultSupplierId" = $3
      AND b."stockQty" > 0 AND (p.name ILIKE $4 OR p."externalCode" ILIKE $4)
    ORDER BY p.name ASC
    LIMIT 20
    `,
    Number(storeId),
    shopId,
    Number(supplierId),
    term,
  );
  res.json(rows);
}));

// =======================================================
// LIST / DETAIL
// =======================================================

router.get('/', asyncHandler(async (req, res) => {
  const { status, storeId, supplierId, mode, search, from, to, page, pageSize } = req.query;
  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  const where: any = { shopId };
  if (status) where.status = String(status);
  if (storeId) where.storeId = Number(storeId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (search) where.vstNo = { contains: String(search), mode: 'insensitive' };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(`${String(to)}T23:59:59.999Z`);
  }
  if (mode === 'PHARMA' || mode === 'NON_PHARMA') {
    const deptName = mode === 'PHARMA' ? 'Pharma' : 'Non-Pharma';
    where.items = { some: { product: { department: { name: deptName } } } };
  }

  const [rows, total] = await Promise.all([
    prisma.vst.findMany({
      where,
      include: {
        ...vstInclude,
        items: { take: 1, include: { product: { include: { department: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.vst.count({ where }),
  ]);

  // VST-to-RTV(%): how much of each VST's total quantity has since been
  // returned to the vendor, aggregated in one query across this page's VSTs
  // rather than N+1 per row.
  const vstIds = rows.map((v) => v.id);
  const pctByVstId = new Map<number, number>();
  if (vstIds.length > 0) {
    const agg = await prisma.$queryRawUnsafe<{ vstId: number; vstQty: number; rtvQty: number }[]>(
      `
      SELECT vi."vstId" as "vstId",
        SUM(vi."vstQtyPieces")::int as "vstQty",
        COALESCE(SUM(ri."rtvQtyPieces"), 0)::int as "rtvQty"
      FROM "VstItem" vi
      LEFT JOIN "RtvItem" ri ON ri."vstItemId" = vi.id
      WHERE vi."vstId" = ANY($1::int[])
      GROUP BY vi."vstId"
      `,
      vstIds,
    );
    for (const row of agg) {
      pctByVstId.set(row.vstId, row.vstQty > 0 ? (row.rtvQty / row.vstQty) * 100 : 0);
    }
  }

  const withDerived = rows.map((v) => ({
    ...v,
    department: v.items[0]?.product?.department?.name || null,
    itemCount: v._count.items,
    vstToRtvPct: pctByVstId.get(v.id) ?? 0,
  }));

  res.json({ rows: withDerived, total, page: pageNum, pageSize: size });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid VST id' });
  const vst = await prisma.vst.findFirst({
    where: { id, shopId: req.shop!.id },
    include: { ...vstInclude, items: { include: { product: true } } },
  });
  if (!vst) return res.status(404).json({ error: 'VST not found' });
  res.json(vst);
}));

// =======================================================
// CREATE / UPDATE / APPROVE
// =======================================================

type VstItemInput = { productId: number; batchNo: string; vstQtyPieces: number; remarks?: string | null };

async function priceVstItems(shopId: number, storeId: number, items: VstItemInput[]) {
  const productIds = items.map((i) => Number(i.productId));
  const [products, batches] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds }, shopId } }),
    prisma.batch.findMany({ where: { productId: { in: productIds }, storeId } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const batchByKey = new Map(batches.map((b) => [`${b.productId}:${b.batchNo}`, b]));

  return items
    .filter((i) => productById.has(Number(i.productId)))
    .map((i) => {
      const product = productById.get(Number(i.productId))!;
      const batch = batchByKey.get(`${product.id}:${i.batchNo}`);
      if (!batch) throw new Error(`No batch ${i.batchNo} found for ${product.name} in this store`);
      const vstQtyPieces = Math.max(0, Number(i.vstQtyPieces) || 0);
      return {
        productId: product.id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        packSize: product.boxQty,
        ppPerPiece: batch.purchasePrice,
        mrpPerPiece: batch.mrp,
        existingQoh: batch.stockQty,
        vstQtyPieces,
        totalPpValue: batch.purchasePrice * vstQtyPieces,
        remarks: i.remarks || null,
      };
    });
}

router.post('/', asyncHandler(async (req, res) => {
  const { storeId, supplierId, remarks, items } = req.body || {};
  if (!storeId || !supplierId) return res.status(400).json({ error: 'Store and Supplier are required' });

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });

  try {
    const pricedItems = Array.isArray(items) ? await priceVstItems(shopId, Number(storeId), items) : [];
    const totalAmount = pricedItems.reduce((a, i) => a + i.totalPpValue, 0);

    const vst = await prisma.$transaction(
      async (tx) => {
        const counter = await tx.vstCounter.upsert({
          where: { shopId },
          update: { value: { increment: 1 } },
          create: { shopId, value: 1 },
        });
        const now = new Date();
        const vstNo = `VST${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(counter.value).padStart(6, '0')}`;

        return tx.vst.create({
          data: {
            shopId,
            storeId: Number(storeId),
            supplierId: Number(supplierId),
            vstNo,
            remarks: remarks || null,
            createdById: req.auth!.sub as number,
            totalAmount,
            items: { create: pricedItems },
          },
          include: { ...vstInclude, items: { include: { product: true } } },
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.status(201).json(vst);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create VST' });
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid VST id' });
  const shopId = req.shop!.id;
  const existing = await prisma.vst.findFirst({ where: { id, shopId } });
  if (!existing) return res.status(404).json({ error: 'VST not found' });
  if (existing.status === 'APPROVED') {
    return res.status(400).json({ error: 'An approved VST can no longer be edited' });
  }

  const { remarks, items } = req.body || {};

  try {
    const pricedItems = Array.isArray(items) ? await priceVstItems(shopId, existing.storeId, items) : [];
    const totalAmount = pricedItems.reduce((a, i) => a + i.totalPpValue, 0);

    const updated = await prisma.$transaction(
      async (tx) => {
        if (Array.isArray(items)) {
          await tx.vstItem.deleteMany({ where: { vstId: id } });
        }
        return tx.vst.update({
          where: { id },
          data: {
            ...(remarks !== undefined ? { remarks: remarks || null } : {}),
            ...(Array.isArray(items) ? { totalAmount, items: { create: pricedItems } } : {}),
          },
          include: { ...vstInclude, items: { include: { product: true } } },
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not update VST' });
  }
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid VST id' });
  const shopId = req.shop!.id;
  const existing = await prisma.vst.findFirst({ where: { id, shopId }, include: { items: true } });
  if (!existing) return res.status(404).json({ error: 'VST not found' });
  if (existing.status === 'APPROVED') {
    const already = await prisma.vst.findUnique({
      where: { id },
      include: { ...vstInclude, items: { include: { product: true } } },
    });
    return res.json(already);
  }
  if (existing.items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        for (const item of existing.items) {
          const batch = await tx.batch.findUnique({
            where: { productId_storeId_batchNo: { productId: item.productId, storeId: existing.storeId, batchNo: item.batchNo } },
          });
          if (!batch || batch.stockQty < item.vstQtyPieces) {
            throw new Error(`Insufficient stock for batch ${item.batchNo} — have ${batch?.stockQty ?? 0}, need ${item.vstQtyPieces}`);
          }
          await tx.batch.update({ where: { id: batch.id }, data: { stockQty: { decrement: item.vstQtyPieces } } });
        }

        return tx.vst.update({
          where: { id },
          data: { status: 'APPROVED', approvedById: req.auth!.sub as number, approvedAt: new Date() },
          include: { ...vstInclude, items: { include: { product: true } } },
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not approve VST' });
  }
}));

export default router;
