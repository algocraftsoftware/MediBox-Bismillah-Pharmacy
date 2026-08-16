import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { adminSelect, priceItems } from './purchaseRequisitionRoutes';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('purchase-order'));

// A Purchase Order is a PurchaseRequisition that has passed the requisition
// stage (status APPROVED or FINAL_APPROVED) — same table, later lifecycle.
const orderInclude = {
  store: true,
  supplier: true,
  deliverToStore: true,
  createdBy: { select: adminSelect },
  approvedBy: { select: adminSelect },
  finalApprovedBy: { select: adminSelect },
} as const;

router.get('/', asyncHandler(async (req, res) => {
  const { mode, poStatus, storeId, supplierId, userId, search, from, to, page, pageSize } = req.query;
  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  const where: any = { shopId, status: { in: ['APPROVED', 'FINAL_APPROVED'] } };
  // poStatus: PENDING = final approval not yet given; DONE = final approval
  // given (regardless of GRN); PENDING_TO_GRN = final approved but no GRN
  // has been raised against it yet.
  if (poStatus === 'PENDING') where.status = 'APPROVED';
  else if (poStatus === 'DONE') where.status = 'FINAL_APPROVED';
  else if (poStatus === 'PENDING_TO_GRN') {
    where.status = 'FINAL_APPROVED';
    where.grns = { none: {} };
  }
  if (mode) where.mode = String(mode);
  if (storeId) where.storeId = Number(storeId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (userId) where.createdById = Number(userId);
  if (search) where.orderNo = { contains: String(search), mode: 'insensitive' };
  if (from || to) {
    where.approvedAt = {};
    if (from) where.approvedAt.gte = new Date(String(from));
    if (to) where.approvedAt.lte = new Date(String(to));
  }

  const [rows, total] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where,
      include: orderInclude,
      orderBy: { approvedAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.purchaseRequisition.count({ where }),
  ]);

  res.json({ rows, total, page: pageNum, pageSize: size });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid order id' });
  const order = await prisma.purchaseRequisition.findFirst({
    where: { id, shopId: req.shop!.id, status: { in: ['APPROVED', 'FINAL_APPROVED'] } },
    include: { ...orderInclude, items: { include: { product: true } } },
  });
  if (!order) return res.status(404).json({ error: 'Purchase order not found' });
  res.json(order);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid order id' });
  const shopId = req.shop!.id;
  const existing = await prisma.purchaseRequisition.findFirst({
    where: { id, shopId, status: { in: ['APPROVED', 'FINAL_APPROVED'] } },
  });
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
  if (existing.status === 'FINAL_APPROVED') {
    return res.status(400).json({ error: 'A finally approved purchase order can no longer be edited' });
  }

  const { deliverToStoreId, paymentMode, expectedDate, consumptionDays, remarks, items } = req.body || {};

  const pricedItems = Array.isArray(items) ? await priceItems(shopId, existing.storeId, items) : [];
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
          ...(deliverToStoreId !== undefined ? { deliverToStoreId: deliverToStoreId ? Number(deliverToStoreId) : null } : {}),
          ...(paymentMode !== undefined ? { paymentMode: paymentMode || null } : {}),
          ...(expectedDate !== undefined ? { expectedDate: expectedDate ? new Date(expectedDate) : null } : {}),
          ...(consumptionDays ? { consumptionDays: Number(consumptionDays) } : {}),
          ...(remarks !== undefined ? { remarks: remarks || null } : {}),
          ...(Array.isArray(items) ? { totalPPAmount, totalMrpAmount, avgGpPct, items: { create: validItems } } : {}),
        },
        include: { ...orderInclude, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.json(updated);
}));

router.post('/:id/final-approve', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid order id' });
  const shopId = req.shop!.id;
  const existing = await prisma.purchaseRequisition.findFirst({
    where: { id, shopId, status: { in: ['APPROVED', 'FINAL_APPROVED'] } },
  });
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
  if (existing.status === 'FINAL_APPROVED') {
    const already = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: { ...orderInclude, items: { include: { product: true } } },
    });
    return res.json(already);
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      const counter = await tx.orderCounter.upsert({
        where: { shopId },
        update: { value: { increment: 1 } },
        create: { shopId, value: 1 },
      });
      const orderNo = `PO${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(counter.value).padStart(6, '0')}`;

      return tx.purchaseRequisition.update({
        where: { id },
        data: {
          status: 'FINAL_APPROVED',
          orderNo,
          finalApprovedById: req.auth!.sub as number,
          finalApprovedAt: new Date(),
        },
        include: { ...orderInclude, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.json(updated);
}));

export default router;
