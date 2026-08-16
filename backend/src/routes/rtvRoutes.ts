import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { adminSelect } from './purchaseRequisitionRoutes';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('return-to-vendor'));

const rtvInclude = {
  store: true,
  supplier: true,
  vst: { select: { id: true, vstNo: true, totalAmount: true } },
  createdBy: { select: adminSelect },
  approvedBy: { select: adminSelect },
} as const;

// How much of an approved RTV's value hasn't yet been credited against a
// supplier via Adjust With PO or Adjustment With Others — shared by both so
// an RTV can't be over-credited across the two features combined.
export async function remainingRtvAdjustableBalance(rtvId: number, excludeGrnId?: number, excludeAdjOthersId?: number): Promise<number> {
  const [rtv, grnUsed, othersUsed] = await Promise.all([
    prisma.rtv.findUnique({ where: { id: rtvId } }),
    prisma.grnRtvAdjustment.aggregate({
      where: { rtvId, ...(excludeGrnId ? { grnId: { not: excludeGrnId } } : {}) },
      _sum: { adjustmentAmount: true },
    }),
    prisma.adjOthersItem.aggregate({
      where: { rtvId, ...(excludeAdjOthersId ? { adjOthersId: { not: excludeAdjOthersId } } : {}) },
      _sum: { adjustmentAmount: true },
    }),
  ]);
  if (!rtv) return 0;
  return Math.max(0, rtv.totalAmount - (grnUsed._sum.adjustmentAmount || 0) - (othersUsed._sum.adjustmentAmount || 0));
}

// =======================================================
// VST PICKERS — approved VSTs for a store(+supplier), then
// that VST's items enriched with how much has already been
// returned across other RTVs (so the RTV Qty input can be
// capped at what's actually still available).
// =======================================================

router.get('/vst-options', asyncHandler(async (req, res) => {
  const { storeId, supplierId } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });
  const shopId = req.shop!.id;
  const where: any = { shopId, storeId: Number(storeId), status: 'APPROVED' };
  if (supplierId) where.supplierId = Number(supplierId);

  const vsts = await prisma.vst.findMany({
    where,
    select: {
      id: true,
      vstNo: true,
      createdAt: true,
      totalAmount: true,
      supplier: { select: { id: true, name: true } },
      store: { select: { id: true, name: true } },
      items: { select: { id: true, vstQtyPieces: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // A VST whose every item has already been fully returned via RTV has
  // nothing left to adjust — drop it from the picker entirely. One with
  // some but not all quantity returned (e.g. 10 of 20 pcs) still belongs
  // here so the remaining balance can be picked up in a later RTV.
  const allItemIds = vsts.flatMap((v) => v.items.map((i) => i.id));
  const returned = allItemIds.length
    ? await prisma.rtvItem.groupBy({
        by: ['vstItemId'],
        where: { vstItemId: { in: allItemIds } },
        _sum: { rtvQtyPieces: true },
      })
    : [];
  const returnedByVstItemId = new Map(returned.map((r) => [r.vstItemId, r._sum.rtvQtyPieces || 0]));

  const withRemaining = vsts.filter((v) =>
    v.items.some((i) => i.vstQtyPieces - (returnedByVstItemId.get(i.id) || 0) > 0)
  );

  res.json(withRemaining.map(({ items, ...v }) => v));
}));

router.get('/vst/:vstId/items', asyncHandler(async (req, res) => {
  const vstId = Number(req.params.vstId);
  if (!Number.isInteger(vstId)) return res.status(400).json({ error: 'Invalid VST id' });
  const shopId = req.shop!.id;

  const vst = await prisma.vst.findFirst({
    where: { id: vstId, shopId, status: 'APPROVED' },
    include: { items: { include: { product: true } } },
  });
  if (!vst) return res.status(404).json({ error: 'Approved VST not found' });

  const returned = await prisma.rtvItem.groupBy({
    by: ['vstItemId'],
    where: { vstItemId: { in: vst.items.map((i) => i.id) } },
    _sum: { rtvQtyPieces: true },
  });
  const returnedByVstItemId = new Map(returned.map((r) => [r.vstItemId, r._sum.rtvQtyPieces || 0]));

  const rows = vst.items
    .map((it) => {
      const alreadyReturned = returnedByVstItemId.get(it.id) || 0;
      return {
        vstItemId: it.id,
        productId: it.productId,
        itemCode: it.product.externalCode,
        itemName: it.product.name,
        dosageForm: it.product.dosageForm,
        uom: it.product.unit,
        packSize: it.packSize,
        purchasePrice: it.ppPerPiece,
        salesPrice: it.mrpPerPiece,
        batchNo: it.batchNo,
        expiryDate: it.expiryDate,
        itemQtyPieces: it.vstQtyPieces,
        alreadyReturnedQty: alreadyReturned,
        availableQty: Math.max(0, it.vstQtyPieces - alreadyReturned),
      };
    })
    // An item already fully returned via a prior RTV has nothing left to
    // pick up — drop it entirely rather than showing it unchecked with a
    // zeroed quantity, so a partially-returned VST only surfaces what's
    // actually still outstanding.
    .filter((it) => it.availableQty > 0);
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
  if (search) {
    const term = String(search);
    where.OR = [
      { rtvNo: { contains: term, mode: 'insensitive' } },
      { vst: { vstNo: { contains: term, mode: 'insensitive' } } },
    ];
  }
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
    prisma.rtv.findMany({
      where,
      include: {
        ...rtvInclude,
        items: { take: 1, include: { product: { include: { department: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.rtv.count({ where }),
  ]);

  const withDerived = rows.map((r) => ({
    ...r,
    department: r.items[0]?.product?.department?.name || null,
  }));

  res.json({ rows: withDerived, total, page: pageNum, pageSize: size });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid RTV id' });
  const rtv = await prisma.rtv.findFirst({
    where: { id, shopId: req.shop!.id },
    include: { ...rtvInclude, items: { include: { product: true } } },
  });
  if (!rtv) return res.status(404).json({ error: 'RTV not found' });
  res.json(rtv);
}));

// =======================================================
// CREATE / UPDATE / APPROVE
// =======================================================

type RtvItemInput = { vstItemId: number; rtvQtyPieces: number };

async function priceRtvItems(shopId: number, vstId: number, excludeRtvId: number | null, items: RtvItemInput[]) {
  const vstItemIds = items.map((i) => Number(i.vstItemId));
  const vstItems = await prisma.vstItem.findMany({
    where: { id: { in: vstItemIds }, vstId, vst: { shopId } },
    include: { product: true },
  });
  const vstItemById = new Map(vstItems.map((i) => [i.id, i]));

  const returned = await prisma.rtvItem.groupBy({
    by: ['vstItemId'],
    where: { vstItemId: { in: vstItemIds }, ...(excludeRtvId ? { rtvId: { not: excludeRtvId } } : {}) },
    _sum: { rtvQtyPieces: true },
  });
  const returnedByVstItemId = new Map(returned.map((r) => [r.vstItemId, r._sum.rtvQtyPieces || 0]));

  return items
    .filter((i) => vstItemById.has(Number(i.vstItemId)))
    .map((i) => {
      const vstItem = vstItemById.get(Number(i.vstItemId))!;
      const alreadyReturned = returnedByVstItemId.get(vstItem.id) || 0;
      const available = Math.max(0, vstItem.vstQtyPieces - alreadyReturned);
      const rtvQtyPieces = Math.max(0, Math.min(available, Number(i.rtvQtyPieces) || 0));
      const remainingQtyPieces = vstItem.vstQtyPieces - rtvQtyPieces;
      return {
        vstItemId: vstItem.id,
        productId: vstItem.productId,
        batchNo: vstItem.batchNo,
        expiryDate: vstItem.expiryDate,
        packSize: vstItem.packSize,
        purchasePrice: vstItem.ppPerPiece,
        salesPrice: vstItem.mrpPerPiece,
        itemQtyPieces: vstItem.vstQtyPieces,
        rtvQtyPieces,
        rtvValue: vstItem.ppPerPiece * rtvQtyPieces,
        remainingQtyPieces,
        remainingValue: remainingQtyPieces * vstItem.mrpPerPiece,
      };
    });
}

router.post('/', asyncHandler(async (req, res) => {
  const { storeId, via, vstId, supplierId, receiverName, receiverContact, remarks, items } = req.body || {};
  if (!storeId || !vstId || !supplierId || !receiverName || !receiverContact) {
    return res.status(400).json({ error: 'From Store, VST No, Supplier, Receiver, and Contact No are required' });
  }

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });
  const vst = await prisma.vst.findFirst({ where: { id: Number(vstId), shopId, status: 'APPROVED' } });
  if (!vst) return res.status(404).json({ error: 'Approved VST not found' });

  try {
    const pricedItems = Array.isArray(items) ? await priceRtvItems(shopId, Number(vstId), null, items) : [];
    if (pricedItems.every((i) => i.rtvQtyPieces <= 0)) {
      return res.status(400).json({ error: 'At least one item with an RTV quantity is required' });
    }
    const totalAmount = pricedItems.reduce((a, i) => a + i.rtvValue, 0);

    const rtv = await prisma.$transaction(
      async (tx) => {
        const counter = await tx.rtvCounter.upsert({
          where: { shopId },
          update: { value: { increment: 1 } },
          create: { shopId, value: 1 },
        });
        const now = new Date();
        const rtvNo = `RTV${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(counter.value).padStart(6, '0')}`;

        return tx.rtv.create({
          data: {
            shopId,
            storeId: Number(storeId),
            via: via === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : 'WAREHOUSE',
            vstId: Number(vstId),
            supplierId: Number(supplierId),
            rtvNo,
            receiverName: String(receiverName),
            receiverContact: String(receiverContact),
            remarks: remarks || null,
            createdById: req.auth!.sub as number,
            totalAmount,
            items: { create: pricedItems.filter((i) => i.rtvQtyPieces > 0) },
          },
          include: { ...rtvInclude, items: { include: { product: true } } },
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.status(201).json(rtv);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create RTV' });
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid RTV id' });
  const shopId = req.shop!.id;
  const existing = await prisma.rtv.findFirst({ where: { id, shopId } });
  if (!existing) return res.status(404).json({ error: 'RTV not found' });
  if (existing.status === 'APPROVED') {
    return res.status(400).json({ error: 'An approved RTV can no longer be edited' });
  }

  const { via, receiverName, receiverContact, remarks, items } = req.body || {};

  try {
    const pricedItems = Array.isArray(items) ? await priceRtvItems(shopId, existing.vstId, existing.id, items) : [];
    const totalAmount = pricedItems.reduce((a, i) => a + i.rtvValue, 0);

    const updated = await prisma.$transaction(
      async (tx) => {
        if (Array.isArray(items)) {
          await tx.rtvItem.deleteMany({ where: { rtvId: id } });
        }
        return tx.rtv.update({
          where: { id },
          data: {
            ...(via !== undefined ? { via: via === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : 'WAREHOUSE' } : {}),
            ...(receiverName !== undefined ? { receiverName: String(receiverName) } : {}),
            ...(receiverContact !== undefined ? { receiverContact: String(receiverContact) } : {}),
            ...(remarks !== undefined ? { remarks: remarks || null } : {}),
            ...(Array.isArray(items)
              ? { totalAmount, items: { create: pricedItems.filter((i) => i.rtvQtyPieces > 0) } }
              : {}),
          },
          include: { ...rtvInclude, items: { include: { product: true } } },
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not update RTV' });
  }
}));

// Approving is a paper-trail step only — the VST already pulled this stock
// out of sellable inventory, so no Batch mutation happens here.
router.post('/:id/approve', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid RTV id' });
  const shopId = req.shop!.id;
  const existing = await prisma.rtv.findFirst({ where: { id, shopId }, include: { items: true } });
  if (!existing) return res.status(404).json({ error: 'RTV not found' });
  if (existing.status === 'APPROVED') {
    const already = await prisma.rtv.findUnique({
      where: { id },
      include: { ...rtvInclude, items: { include: { product: true } } },
    });
    return res.json(already);
  }
  if (existing.items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const updated = await prisma.rtv.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: req.auth!.sub as number, approvedAt: new Date() },
    include: { ...rtvInclude, items: { include: { product: true } } },
  });

  res.json(updated);
}));

export default router;
