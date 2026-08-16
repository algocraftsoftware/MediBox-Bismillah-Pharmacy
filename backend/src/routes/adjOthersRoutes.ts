import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { adminSelect } from './purchaseRequisitionRoutes';
import { remainingRtvAdjustableBalance } from './rtvRoutes';
import { asyncHandler } from '../asyncHandler';

// =======================================================
// ADJUSTMENT WITH OTHERS — a lightweight credit against one
// or more approved RTVs with no PO/items/stock movement at
// all (unlike Adjust With PO). Just records how much of each
// RTV's value is being treated as a cash-equivalent
// adjustment against the supplier.
// =======================================================

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('adj-with-others'));

const adjOthersInclude = {
  store: true,
  supplier: true,
  createdBy: { select: adminSelect },
  approvedBy: { select: adminSelect },
  items: { include: { rtv: { select: { id: true, rtvNo: true, totalAmount: true, createdAt: true, store: { select: { id: true, name: true } } } } } },
} as const;

async function priceAdjOthersItems(
  shopId: number,
  excludeAdjOthersId: number | null,
  lines: { rtvId: number; adjustmentAmount: number }[],
) {
  const results: { rtvId: number; adjustmentAmount: number }[] = [];
  for (const line of lines) {
    const rtv = await prisma.rtv.findFirst({ where: { id: Number(line.rtvId), shopId, status: 'APPROVED' } });
    if (!rtv) continue;
    const remaining = await remainingRtvAdjustableBalance(rtv.id, undefined, excludeAdjOthersId ?? undefined);
    const amount = Math.max(0, Math.min(remaining, Number(line.adjustmentAmount) || 0));
    if (amount > 0) results.push({ rtvId: rtv.id, adjustmentAmount: amount });
  }
  return results;
}

router.get('/rtv-options', asyncHandler(async (req, res) => {
  const { supplierId } = req.query;
  if (!supplierId) return res.status(400).json({ error: 'supplierId is required' });
  const shopId = req.shop!.id;
  // Deliberately NOT filtered by storeId — an RTV's remaining credit is owed
  // by the supplier shop-wide, not scoped to the store it was returned from,
  // so every approved RTV for this supplier (from any store) is eligible.
  const rtvs = await prisma.rtv.findMany({
    where: { shopId, supplierId: Number(supplierId), status: 'APPROVED' },
    select: { id: true, rtvNo: true, totalAmount: true, createdAt: true, store: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const withBalance = await Promise.all(
    rtvs.map(async (r) => ({ ...r, remainingBalance: await remainingRtvAdjustableBalance(r.id) })),
  );
  res.json(withBalance.filter((r) => r.remainingBalance > 0));
}));

router.get('/', asyncHandler(async (req, res) => {
  const { status, storeId, supplierId, search, from, to, page, pageSize } = req.query;
  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  const where: any = { shopId };
  if (status) where.status = String(status);
  if (storeId) where.storeId = Number(storeId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (search) {
    const term = String(search);
    where.OR = [
      { txnNo: { contains: term, mode: 'insensitive' } },
      { items: { some: { rtv: { rtvNo: { contains: term, mode: 'insensitive' } } } } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(`${String(to)}T23:59:59.999Z`);
  }
  const [rows, total] = await Promise.all([
    prisma.adjOthers.findMany({
      where,
      include: adjOthersInclude,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.adjOthers.count({ where }),
  ]);

  res.json({ rows, total, page: pageNum, pageSize: size });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ADJ id' });
  const adj = await prisma.adjOthers.findFirst({
    where: { id, shopId: req.shop!.id },
    include: adjOthersInclude,
  });
  if (!adj) return res.status(404).json({ error: 'Adjustment not found' });
  res.json(adj);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { storeId, supplierId, adjType, via, remarks, items } = req.body || {};
  if (!storeId || !supplierId || !adjType || !via) {
    return res.status(400).json({ error: 'Store, Supplier, Adjustment Type, and RTV VIA are required' });
  }

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });

  try {
    const pricedItems = Array.isArray(items) ? await priceAdjOthersItems(shopId, null, items) : [];
    const totalAdjustmentAmount = pricedItems.reduce((a, i) => a + i.adjustmentAmount, 0);

    const adj = await prisma.$transaction(
      async (tx) => {
        const counter = await tx.adjOthersCounter.upsert({
          where: { shopId },
          update: { value: { increment: 1 } },
          create: { shopId, value: 1 },
        });
        const now = new Date();
        const txnNo = `ADJO${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(counter.value).padStart(6, '0')}`;

        return tx.adjOthers.create({
          data: {
            shopId,
            storeId: Number(storeId),
            supplierId: Number(supplierId),
            adjType: adjType === 'OTHERS' ? 'OTHERS' : 'SUPPLIER',
            via: via === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : 'WAREHOUSE',
            txnNo,
            remarks: remarks || null,
            createdById: req.auth!.sub as number,
            totalAdjustmentAmount,
            items: { create: pricedItems },
          },
          include: adjOthersInclude,
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.status(201).json(adj);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create adjustment' });
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ADJ id' });
  const shopId = req.shop!.id;
  const existing = await prisma.adjOthers.findFirst({ where: { id, shopId } });
  if (!existing) return res.status(404).json({ error: 'Adjustment not found' });
  if (existing.status === 'APPROVED') {
    return res.status(400).json({ error: 'An approved adjustment can no longer be edited' });
  }

  const { adjType, via, remarks, items } = req.body || {};

  try {
    const pricedItems = Array.isArray(items) ? await priceAdjOthersItems(shopId, id, items) : [];
    const totalAdjustmentAmount = pricedItems.reduce((a, i) => a + i.adjustmentAmount, 0);

    const updated = await prisma.$transaction(
      async (tx) => {
        if (Array.isArray(items)) await tx.adjOthersItem.deleteMany({ where: { adjOthersId: id } });
        return tx.adjOthers.update({
          where: { id },
          data: {
            ...(adjType !== undefined ? { adjType: adjType === 'OTHERS' ? 'OTHERS' : 'SUPPLIER' } : {}),
            ...(via !== undefined ? { via: via === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : 'WAREHOUSE' } : {}),
            ...(remarks !== undefined ? { remarks: remarks || null } : {}),
            ...(Array.isArray(items) ? { totalAdjustmentAmount, items: { create: pricedItems } } : {}),
          },
          include: adjOthersInclude,
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not update adjustment' });
  }
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ADJ id' });
  const shopId = req.shop!.id;
  const existing = await prisma.adjOthers.findFirst({ where: { id, shopId }, include: { items: true } });
  if (!existing) return res.status(404).json({ error: 'Adjustment not found' });
  if (existing.status === 'APPROVED') {
    const already = await prisma.adjOthers.findUnique({ where: { id }, include: adjOthersInclude });
    return res.json(already);
  }
  if (existing.items.length === 0) {
    return res.status(400).json({ error: 'At least one RTV is required' });
  }

  const updated = await prisma.adjOthers.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: req.auth!.sub as number, approvedAt: new Date() },
    include: adjOthersInclude,
  });

  res.json(updated);
}));

export default router;
