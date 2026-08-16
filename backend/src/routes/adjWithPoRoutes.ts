import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { adminSelect } from './purchaseRequisitionRoutes';
import { grnInclude, priceGrnItems } from './grnRoutes';
import { remainingRtvAdjustableBalance } from './rtvRoutes';
import { asyncHandler } from '../asyncHandler';

// =======================================================
// ADJUST WITH PO — receiving replacement stock against a
// Purchase Order (same mechanics as GRN With PO) while
// crediting one or more approved RTVs against what's owed to
// the supplier. Shares the Grn/GrnItem tables (kind:
// 'ADJUST_WITH_PO' disambiguates it from a standard GRN With
// PO, since both carry a non-null purchaseOrderId). Approving
// still increments stock exactly like a normal GRN — this is
// genuinely receiving physical replacement goods.
// =======================================================

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('adj-with-po'));

const adjWithPoInclude = {
  ...grnInclude,
  rtvAdjustments: { include: { rtv: { select: { id: true, rtvNo: true, totalAmount: true, storeId: true, createdAt: true } } } },
} as const;

async function priceRtvAdjustments(
  shopId: number,
  excludeGrnId: number | null,
  lines: { rtvId: number; adjustmentAmount: number }[],
) {
  const results: { rtvId: number; adjustmentAmount: number }[] = [];
  for (const line of lines) {
    const rtv = await prisma.rtv.findFirst({ where: { id: Number(line.rtvId), shopId, status: 'APPROVED' } });
    if (!rtv) continue;
    const remaining = await remainingRtvAdjustableBalance(rtv.id, excludeGrnId ?? undefined);
    const amount = Math.max(0, Math.min(remaining, Number(line.adjustmentAmount) || 0));
    if (amount > 0) results.push({ rtvId: rtv.id, adjustmentAmount: amount });
  }
  return results;
}

// =======================================================
// PO / RTV PICKERS
// =======================================================

router.get('/purchase-orders', asyncHandler(async (req, res) => {
  const { storeId, supplierId, from, to } = req.query;
  const shopId = req.shop!.id;
  const where: any = { shopId, status: 'FINAL_APPROVED' };
  if (storeId) where.storeId = Number(storeId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (from || to) {
    where.finalApprovedAt = {};
    if (from) where.finalApprovedAt.gte = new Date(String(from));
    if (to) where.finalApprovedAt.lte = new Date(String(to));
  }
  const orders = await prisma.purchaseRequisition.findMany({
    where,
    select: {
      id: true,
      orderNo: true,
      finalApprovedAt: true,
      totalPPAmount: true,
      supplier: { select: { id: true, name: true } },
      store: { select: { id: true, name: true } },
    },
    orderBy: { finalApprovedAt: 'desc' },
    take: 100,
  });
  res.json(orders);
}));

router.get('/purchase-orders/:id/items', asyncHandler(async (req, res) => {
  const poId = Number(req.params.id);
  const { storeId } = req.query;
  if (!Number.isInteger(poId)) return res.status(400).json({ error: 'Invalid PO id' });
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });
  const shopId = req.shop!.id;
  const po = await prisma.purchaseRequisition.findFirst({
    where: { id: poId, shopId, status: 'FINAL_APPROVED' },
    include: { items: true },
  });
  if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

  const priced = await priceGrnItems(
    shopId,
    Number(storeId),
    po.id,
    po.items.map((it) => ({ productId: it.productId, rcvQtyBox: it.qtyBox, rcvQtyPieces: it.qtyPieces })),
  );
  res.json(priced);
}));

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

// =======================================================
// LIST / DETAIL
// =======================================================

router.get('/', asyncHandler(async (req, res) => {
  const { status, storeId, rtvStoreId, supplierId, mode, search, from, to, page, pageSize } = req.query;
  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  const where: any = { shopId, kind: 'ADJUST_WITH_PO' };
  if (status) where.status = String(status);
  // storeId = "ADJ Store" (where the adjustment/GRN itself happens); rtvStoreId
  // = "RTV From" (the store the credited RTV(s) were originally done under) —
  // deliberately separate filters since the spec draws this distinction out.
  if (storeId) where.storeId = Number(storeId);
  if (rtvStoreId) where.rtvAdjustments = { some: { rtv: { storeId: Number(rtvStoreId) } } };
  if (supplierId) where.supplierId = Number(supplierId);
  if (search) {
    const term = String(search);
    where.OR = [
      { transactionNo: { contains: term, mode: 'insensitive' } },
      { invoiceNo: { contains: term, mode: 'insensitive' } },
      { rtvAdjustments: { some: { rtv: { rtvNo: { contains: term, mode: 'insensitive' } } } } },
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
    prisma.grn.findMany({
      where,
      include: {
        ...adjWithPoInclude,
        items: { take: 1, include: { product: { include: { department: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.grn.count({ where }),
  ]);

  const withDerived = rows.map((g) => ({
    ...g,
    department: g.items[0]?.product?.department?.name || null,
  }));

  res.json({ rows: withDerived, total, page: pageNum, pageSize: size });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ADJ id' });
  const grn = await prisma.grn.findFirst({
    where: { id, shopId: req.shop!.id, kind: 'ADJUST_WITH_PO' },
    include: { ...adjWithPoInclude, items: { include: { product: true } } },
  });
  if (!grn) return res.status(404).json({ error: 'Adjustment not found' });
  res.json(grn);
}));

// =======================================================
// CREATE / UPDATE / APPROVE
// =======================================================

router.post('/', asyncHandler(async (req, res) => {
  const {
    storeId, supplierId, purchaseOrderId, invoiceNo, invoiceDate, paymentType, receivedById,
    via, remarks, invoiceDiscount, items, rtvAdjustments,
  } = req.body || {};

  if (!storeId || !supplierId || !purchaseOrderId || !invoiceNo || !invoiceDate || !paymentType || !receivedById) {
    return res.status(400).json({
      error: 'Store, Supplier, PO No, Invoice Number, Invoice Date, Payment Type, and Received By are required',
    });
  }

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });
  const po = await prisma.purchaseRequisition.findFirst({
    where: { id: Number(purchaseOrderId), shopId, status: 'FINAL_APPROVED' },
  });
  if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

  try {
    const pricedItems = Array.isArray(items)
      ? await priceGrnItems(shopId, Number(storeId), Number(purchaseOrderId), items)
      : [];
    const rtvLines = await priceRtvAdjustments(shopId, null, Array.isArray(rtvAdjustments) ? rtvAdjustments : []);

    const totalTradeValue = pricedItems.reduce((a, i) => a + i.totalValue, 0);
    const totalVat = pricedItems.reduce((a, i) => a + i.vatAmt, 0);
    const totalDiscount = pricedItems.reduce((a, i) => a + i.discAmt, 0);
    const avgGpPct = pricedItems.length ? pricedItems.reduce((a, i) => a + i.gpPct, 0) / pricedItems.length : 0;
    const rtvAdjustmentValue = rtvLines.reduce((a, i) => a + i.adjustmentAmount, 0);
    const resolvedInvoiceDiscount = Number(invoiceDiscount) || 0;
    const netPayable = totalTradeValue + totalVat - totalDiscount - resolvedInvoiceDiscount - rtvAdjustmentValue;

    const grn = await prisma.$transaction(
      async (tx) => {
        const counter = await tx.grnaCounter.upsert({
          where: { shopId },
          update: { value: { increment: 1 } },
          create: { shopId, value: 1 },
        });
        const now = new Date();
        const transactionNo = `GRNA${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(counter.value).padStart(6, '0')}`;

        return tx.grn.create({
          data: {
            shopId,
            storeId: Number(storeId),
            supplierId: Number(supplierId),
            purchaseOrderId: Number(purchaseOrderId),
            kind: 'ADJUST_WITH_PO',
            transactionNo,
            invoiceNo: String(invoiceNo),
            invoiceDate: new Date(invoiceDate),
            paymentType: String(paymentType),
            via: via === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : 'WAREHOUSE',
            receivedById: Number(receivedById),
            createdById: req.auth!.sub as number,
            remarks: remarks || null,
            invoiceDiscount: resolvedInvoiceDiscount,
            totalTradeValue,
            totalVat,
            totalDiscount,
            netAmount: netPayable,
            rtvAdjustmentValue,
            avgGpPct,
            items: { create: pricedItems },
            rtvAdjustments: { create: rtvLines },
          },
          include: { ...adjWithPoInclude, items: { include: { product: true } } },
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.status(201).json(grn);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create adjustment' });
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid ADJ id' });
  const shopId = req.shop!.id;
  const existing = await prisma.grn.findFirst({ where: { id, shopId, kind: 'ADJUST_WITH_PO' } });
  if (!existing) return res.status(404).json({ error: 'Adjustment not found' });
  if (existing.status === 'APPROVED') {
    return res.status(400).json({ error: 'An approved adjustment can no longer be edited' });
  }

  const {
    invoiceNo, invoiceDate, paymentType, receivedById, via, remarks, invoiceDiscount, items, rtvAdjustments, purchaseOrderId,
  } = req.body || {};

  try {
    // Switching to a different PO (e.g. the wrong one of two from the same
    // supplier was picked at creation) re-seeds the item grid from that PO's
    // own items, same as GRN With PO's equivalent switch.
    let poSwitch = false;
    let targetPurchaseOrderId = existing.purchaseOrderId;
    let seededItems: Array<{ productId: number; rcvQtyBox: number; rcvQtyPieces: number }> = [];
    if (purchaseOrderId !== undefined && Number(purchaseOrderId) !== existing.purchaseOrderId) {
      const newPo = await prisma.purchaseRequisition.findFirst({
        where: { id: Number(purchaseOrderId), shopId, supplierId: existing.supplierId, status: 'FINAL_APPROVED' },
        include: { items: true },
      });
      if (!newPo) return res.status(400).json({ error: 'Purchase Order not found for this supplier' });
      poSwitch = true;
      targetPurchaseOrderId = newPo.id;
      seededItems = newPo.items.map((it) => ({ productId: it.productId, rcvQtyBox: it.qtyBox, rcvQtyPieces: it.qtyPieces }));
    }
    const replacesItems = poSwitch || Array.isArray(items);

    // Client-provided items win when given — the frontend already re-seeds
    // items locally the moment a different PO is picked (see handlePickPo in
    // DetailView.tsx) and lets the receiver edit them before saving, so the
    // auto reseed here is only a fallback for a bare "just switch the PO"
    // call with no items attached.
    const pricedItems = Array.isArray(items)
      ? await priceGrnItems(shopId, existing.storeId, targetPurchaseOrderId, items)
      : poSwitch
      ? await priceGrnItems(shopId, existing.storeId, targetPurchaseOrderId, seededItems)
      : [];
    const rtvLines = Array.isArray(rtvAdjustments)
      ? await priceRtvAdjustments(shopId, existing.id, rtvAdjustments)
      : [];

    const totalTradeValue = pricedItems.reduce((a, i) => a + i.totalValue, 0);
    const totalVat = pricedItems.reduce((a, i) => a + i.vatAmt, 0);
    const totalDiscount = pricedItems.reduce((a, i) => a + i.discAmt, 0);
    const avgGpPct = pricedItems.length ? pricedItems.reduce((a, i) => a + i.gpPct, 0) / pricedItems.length : 0;
    const rtvAdjustmentValue = rtvLines.reduce((a, i) => a + i.adjustmentAmount, 0);
    const resolvedInvoiceDiscount = invoiceDiscount !== undefined ? Number(invoiceDiscount) || 0 : existing.invoiceDiscount;
    const netPayable = totalTradeValue + totalVat - totalDiscount - resolvedInvoiceDiscount - rtvAdjustmentValue;

    const updated = await prisma.$transaction(
      async (tx) => {
        if (replacesItems) await tx.grnItem.deleteMany({ where: { grnId: id } });
        if (Array.isArray(rtvAdjustments)) await tx.grnRtvAdjustment.deleteMany({ where: { grnId: id } });

        return tx.grn.update({
          where: { id },
          data: {
            ...(invoiceNo !== undefined ? { invoiceNo: String(invoiceNo) } : {}),
            ...(invoiceDate !== undefined ? { invoiceDate: new Date(invoiceDate) } : {}),
            ...(paymentType !== undefined ? { paymentType: String(paymentType) } : {}),
            ...(receivedById !== undefined ? { receivedById: Number(receivedById) } : {}),
            ...(via !== undefined ? { via: via === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : 'WAREHOUSE' } : {}),
            ...(remarks !== undefined ? { remarks: remarks || null } : {}),
            ...(invoiceDiscount !== undefined ? { invoiceDiscount: resolvedInvoiceDiscount } : {}),
            ...(poSwitch ? { purchaseOrderId: targetPurchaseOrderId } : {}),
            ...(replacesItems || Array.isArray(rtvAdjustments)
              ? { totalTradeValue, totalVat, totalDiscount, netAmount: netPayable, rtvAdjustmentValue, avgGpPct }
              : {}),
            ...(replacesItems ? { items: { create: pricedItems } } : {}),
            ...(Array.isArray(rtvAdjustments) ? { rtvAdjustments: { create: rtvLines } } : {}),
          },
          include: { ...adjWithPoInclude, items: { include: { product: true } } },
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
  const existing = await prisma.grn.findFirst({ where: { id, shopId, kind: 'ADJUST_WITH_PO' }, include: { items: true } });
  if (!existing) return res.status(404).json({ error: 'Adjustment not found' });
  if (existing.status === 'APPROVED') {
    const already = await prisma.grn.findUnique({
      where: { id },
      include: { ...adjWithPoInclude, items: { include: { product: true } } },
    });
    return res.json(already);
  }

  if (!existing.paymentType) return res.status(400).json({ error: 'Payment Type is required' });
  if (!existing.receivedById) return res.status(400).json({ error: 'Received By is required' });
  const itemsWithQty = existing.items.filter((i) => i.totalQtyPieces > 0);
  if (itemsWithQty.length === 0) {
    return res.status(400).json({ error: 'At least one item with a received quantity is required' });
  }
  const missingBatch = itemsWithQty.find((i) => !i.batchNo || !i.expiryDate);
  if (missingBatch) {
    return res.status(400).json({ error: 'Batch Number and Expiry Date are required for every received item' });
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      for (const item of itemsWithQty) {
        await tx.batch.upsert({
          where: {
            productId_storeId_batchNo: { productId: item.productId, storeId: existing.storeId, batchNo: item.batchNo! },
          },
          update: {
            stockQty: { increment: item.totalQtyPieces },
            purchasePrice: item.unitPrice,
            mrp: item.mrp,
            sellingPrice: item.mrp,
            expiryDate: item.expiryDate!,
          },
          create: {
            productId: item.productId,
            storeId: existing.storeId,
            batchNo: item.batchNo!,
            expiryDate: item.expiryDate!,
            mrp: item.mrp,
            purchasePrice: item.unitPrice,
            sellingPrice: item.mrp,
            stockQty: item.totalQtyPieces,
          },
        });
      }

      return tx.grn.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: req.auth!.sub as number, approvedAt: new Date() },
        include: { ...adjWithPoInclude, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.json(updated);
}));

export default router;
