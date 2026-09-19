import { Router } from 'express';
import { prisma } from '../db';
<<<<<<< HEAD
import { requireAdminRole, requirePermission, requireShopAdmin } from '../auth';
=======
import { requirePermission, requireShopAdmin } from '../auth';
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
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
<<<<<<< HEAD
    include: { ...orderInclude, items: {
        // Alphabetical by product name. A requisition is built in whatever
        // order items were picked; a purchase order and the GRN raised
        // against it are read and checked off against the delivery, which
        // is far easier down a sorted list.
        orderBy: { product: { name: 'asc' } },
        include: { product: { include: { department: { select: { name: true } } } } },
      } },
=======
    include: { ...orderInclude, items: { include: { product: true } } },
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
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
<<<<<<< HEAD
        include: { ...orderInclude, items: {
        // Alphabetical by product name. A requisition is built in whatever
        // order items were picked; a purchase order and the GRN raised
        // against it are read and checked off against the delivery, which
        // is far easier down a sorted list.
        orderBy: { product: { name: 'asc' } },
        include: { product: { include: { department: { select: { name: true } } } } },
      } },
=======
        include: { ...orderInclude, items: { include: { product: true } } },
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
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
<<<<<<< HEAD
      include: { ...orderInclude, items: {
        // Alphabetical by product name. A requisition is built in whatever
        // order items were picked; a purchase order and the GRN raised
        // against it are read and checked off against the delivery, which
        // is far easier down a sorted list.
        orderBy: { product: { name: 'asc' } },
        include: { product: { include: { department: { select: { name: true } } } } },
      } },
=======
      include: { ...orderInclude, items: { include: { product: true } } },
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
    });
    return res.json(already);
  }

  const updated = await prisma.$transaction(
    async (tx) => {
<<<<<<< HEAD
      // Reuse the number if this order has been final-approved before and
      // since un-approved — drawing a fresh one each time would leave gaps in
      // the shop's PO sequence.
      let orderNo = existing.orderNo;
      if (!orderNo) {
        const counter = await tx.orderCounter.upsert({
          where: { shopId },
          update: { value: { increment: 1 } },
          create: { shopId, value: 1 },
        });
        orderNo = `PO${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(counter.value).padStart(6, '0')}`;
      }
=======
      const counter = await tx.orderCounter.upsert({
        where: { shopId },
        update: { value: { increment: 1 } },
        create: { shopId, value: 1 },
      });
      const orderNo = `PO${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(counter.value).padStart(6, '0')}`;
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

      return tx.purchaseRequisition.update({
        where: { id },
        data: {
          status: 'FINAL_APPROVED',
          orderNo,
          finalApprovedById: req.auth!.sub as number,
          finalApprovedAt: new Date(),
        },
<<<<<<< HEAD
        include: { ...orderInclude, items: {
        // Alphabetical by product name. A requisition is built in whatever
        // order items were picked; a purchase order and the GRN raised
        // against it are read and checked off against the delivery, which
        // is far easier down a sorted list.
        orderBy: { product: { name: 'asc' } },
        include: { product: { include: { department: { select: { name: true } } } } },
      } },
=======
        include: { ...orderInclude, items: { include: { product: true } } },
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.json(updated);
}));

<<<<<<< HEAD
// Un-approve a purchase order: FINAL_APPROVED back to APPROVED, which returns
// it to "Pending" in this list and reopens final approval. Admin-only.
//
// The order number is deliberately kept. Clearing it would burn a number out of
// the shop's PO sequence on every un-approve, leaving gaps in a document series
// that is meant to be continuous; final approval reuses the number it already
// issued instead of drawing a fresh one.
router.post('/:id/unapprove', requireAdminRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid order id' });
  const shopId = req.shop!.id;

  const existing = await prisma.purchaseRequisition.findFirst({ where: { id, shopId } });
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
  if (existing.status !== 'FINAL_APPROVED') {
    return res.status(400).json({ error: 'Only a final-approved purchase order can be un-approved' });
  }

  // Goods received against this order have already been booked in against it.
  const grns = await prisma.grn.count({ where: { purchaseOrderId: id } });
  if (grns > 0) {
    return res.status(400).json({
      error: 'Cannot un-approve: a GRN has been raised against this purchase order. Un-approve and remove that GRN first.',
    });
  }

  const updated = await prisma.purchaseRequisition.update({
    where: { id },
    data: { status: 'APPROVED', finalApprovedById: null, finalApprovedAt: null },
    include: { ...orderInclude, items: {
        // Alphabetical by product name. A requisition is built in whatever
        // order items were picked; a purchase order and the GRN raised
        // against it are read and checked off against the delivery, which
        // is far easier down a sorted list.
        orderBy: { product: { name: 'asc' } },
        include: { product: { include: { department: { select: { name: true } } } } },
      } },
  });
  res.json(updated);
}));

=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
export default router;
