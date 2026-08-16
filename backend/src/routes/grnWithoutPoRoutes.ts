import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { grnInclude, priceGrnItems } from './grnRoutes';
import { asyncHandler } from '../asyncHandler';

// =======================================================
// GRN WITHOUT PO — same Grn/GrnItem tables as GRN With PO,
// but purchaseOrderId is always null on these rows and they
// get their own "GRNW..." transaction-number sequence. Items
// are added by hand (no PO to seed from), priced off the
// supplier catalog / latest batch via priceGrnItems().
// =======================================================

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('grn-without-po'));

// =======================================================
// ITEM SEARCH — GRN Without PO has no PO/supplier catalog to
// seed from, so unlike Purchase Requisition's /items grid this
// is NOT restricted to the product's defaultSupplierId: a
// "without PO" receipt can legitimately contain any product the
// supplier physically delivered, so the whole shop catalog is
// searchable here (store-scoped only, for pricing/stock).
// =======================================================

router.get('/items', asyncHandler(async (req, res) => {
  const { storeId, search } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });

  const shopId = req.shop!.id;
  const where: any = { shopId };
  if (search) {
    const term = String(search);
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { externalCode: { contains: term, mode: 'insensitive' } },
    ];
  }

  const products = await prisma.product.findMany({ where, take: 20, orderBy: { name: 'asc' } });
  const productIds = products.map((p) => p.id);
  const [storeBatches, anyBatches] = await Promise.all([
    prisma.batch.findMany({ where: { productId: { in: productIds }, storeId: Number(storeId) }, orderBy: { createdAt: 'desc' } }),
    prisma.batch.findMany({ where: { productId: { in: productIds } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const storeBatchByProduct = new Map<number, (typeof storeBatches)[number]>();
  for (const b of storeBatches) if (!storeBatchByProduct.has(b.productId)) storeBatchByProduct.set(b.productId, b);
  const anyBatchByProduct = new Map<number, (typeof anyBatches)[number]>();
  for (const b of anyBatches) if (!anyBatchByProduct.has(b.productId)) anyBatchByProduct.set(b.productId, b);

  const rows = products.map((p) => {
    const storeBatch = storeBatchByProduct.get(p.id);
    const batch = storeBatch || anyBatchByProduct.get(p.id);
    const ppPerPiece = batch?.purchasePrice || 0;
    const mrpPerPiece = batch?.mrp || 0;
    const gp = mrpPerPiece - ppPerPiece;
    const gpPct = mrpPerPiece > 0 ? (gp / mrpPerPiece) * 100 : 0;
    return {
      productId: p.id,
      itemCode: p.externalCode,
      itemName: p.name,
      genericName: p.genericName,
      uom: p.unit,
      packSize: p.boxQty,
      rol: p.reorderLevel,
      qoh: storeBatch?.stockQty || 0,
      ppPerPiece,
      mrpPerPiece,
      consumptionPieces: 0,
      consumptionBox: 0,
      gp,
      gpPct,
    };
  });

  res.json({ rows, total: rows.length, page: 1, pageSize: rows.length });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { status, storeId, supplierId, search, date, page, pageSize } = req.query;
  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  const where: any = { shopId, purchaseOrderId: null };
  if (status) where.status = String(status);
  if (storeId) where.storeId = Number(storeId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (search) {
    const term = String(search);
    where.OR = [
      { transactionNo: { contains: term, mode: 'insensitive' } },
      { invoiceNo: { contains: term, mode: 'insensitive' } },
    ];
  }
  if (date) {
    where.createdAt = { gte: new Date(String(date)) };
  }

  const [rows, total] = await Promise.all([
    prisma.grn.findMany({
      where,
      include: grnInclude,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.grn.count({ where }),
  ]);

  res.json({ rows, total, page: pageNum, pageSize: size });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid GRN id' });
  const grn = await prisma.grn.findFirst({
    where: { id, shopId: req.shop!.id, purchaseOrderId: null },
    include: { ...grnInclude, items: { include: { product: true } } },
  });
  if (!grn) return res.status(404).json({ error: 'GRN not found' });
  res.json(grn);
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    storeId,
    supplierId,
    invoiceNo,
    invoiceDate,
    paymentType,
    receivedById,
    transactionRefNo,
    remarks,
    invoiceDiscount,
    invoiceVat,
    expiryAdjustmentAmount,
    items,
  } = req.body || {};

  if (!storeId || !supplierId || !invoiceNo || !invoiceDate || !paymentType || !receivedById) {
    return res
      .status(400)
      .json({ error: 'Store, Supplier, Invoice Number, Invoice Date, Payment Type, and Received By are required' });
  }

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });

  // Items are optional at creation — the New page lets you stage items before
  // the GRN exists, but you can also just fill the header and add items
  // afterward on the Detail page. Same pricing pass PUT uses so both paths
  // produce identical totals.
  const pricedItems = Array.isArray(items)
    ? await priceGrnItems(shopId, Number(storeId), null, items, { bonusAffectsPricing: false })
    : [];
  const totalTradeValue = pricedItems.reduce((a, i) => a + i.totalValue, 0);
  const totalVat = pricedItems.reduce((a, i) => a + i.vatAmt, 0);
  const totalDiscount = pricedItems.reduce((a, i) => a + i.discAmt, 0);
  const resolvedExpiryAdjustmentAmount = Number(expiryAdjustmentAmount) || 0;
  const netAmount = pricedItems.reduce((a, i) => a + i.netTotal, 0) - resolvedExpiryAdjustmentAmount;
  const avgGpPct = pricedItems.length ? pricedItems.reduce((a, i) => a + i.gpPct, 0) / pricedItems.length : 0;

  const grn = await prisma.$transaction(
    async (tx) => {
      const counter = await tx.grnwCounter.upsert({
        where: { shopId },
        update: { value: { increment: 1 } },
        create: { shopId, value: 1 },
      });
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const transactionNo = `GRNW${year}${month}${String(counter.value).padStart(6, '0')}`;

      return tx.grn.create({
        data: {
          shopId,
          storeId: Number(storeId),
          supplierId: Number(supplierId),
          purchaseOrderId: null,
          transactionNo,
          invoiceNo: String(invoiceNo),
          invoiceDate: new Date(invoiceDate),
          paymentType: String(paymentType),
          receivedById: Number(receivedById),
          transactionRefNo: transactionRefNo || null,
          remarks: remarks || null,
          invoiceDiscount: Number(invoiceDiscount) || 0,
          invoiceVat: Number(invoiceVat) || 0,
          expiryAdjustmentAmount: resolvedExpiryAdjustmentAmount,
          totalTradeValue,
          totalVat,
          totalDiscount,
          netAmount,
          avgGpPct,
          createdById: req.auth!.sub as number,
          items: pricedItems.length ? { create: pricedItems } : undefined,
        },
        include: { ...grnInclude, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.status(201).json(grn);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid GRN id' });
  const shopId = req.shop!.id;
  const existing = await prisma.grn.findFirst({ where: { id, shopId, purchaseOrderId: null } });
  if (!existing) return res.status(404).json({ error: 'GRN not found' });
  if (existing.status !== 'UNAPPROVED') {
    return res.status(400).json({ error: 'Only an unapproved GRN can be edited' });
  }

  const {
    storeId,
    supplierId,
    invoiceNo,
    invoiceDate,
    paymentType,
    transactionRefNo,
    receivedById,
    remarks,
    invoiceDiscount,
    invoiceVat,
    expiryAdjustmentAmount,
    items,
  } = req.body || {};

  const pricedItems = Array.isArray(items)
    ? await priceGrnItems(shopId, existing.storeId, null, items, { bonusAffectsPricing: false })
    : [];
  const totalTradeValue = pricedItems.reduce((a, i) => a + i.totalValue, 0);
  const totalVat = pricedItems.reduce((a, i) => a + i.vatAmt, 0);
  const totalDiscount = pricedItems.reduce((a, i) => a + i.discAmt, 0);
  const resolvedInvoiceDiscount = invoiceDiscount !== undefined ? Number(invoiceDiscount) || 0 : existing.invoiceDiscount;
  const resolvedInvoiceVat = invoiceVat !== undefined ? Number(invoiceVat) || 0 : existing.invoiceVat;
  const resolvedExpiryAdjustmentAmount =
    expiryAdjustmentAmount !== undefined ? Number(expiryAdjustmentAmount) || 0 : existing.expiryAdjustmentAmount;
  // invoiceDiscount/invoiceVat are staging inputs the CALCULATE button
  // spreads into each item's own discAmt/vatAmt (proportional to Total
  // Value) — netTotal above already sums those distributed amounts, so
  // they're kept here only for display/audit on the saved record.
  const netAmount = pricedItems.reduce((a, i) => a + i.netTotal, 0) - resolvedExpiryAdjustmentAmount;
  const avgGpPct = pricedItems.length ? pricedItems.reduce((a, i) => a + i.gpPct, 0) / pricedItems.length : 0;

  const updated = await prisma.$transaction(
    async (tx) => {
      if (Array.isArray(items)) {
        await tx.grnItem.deleteMany({ where: { grnId: id } });
      }
      return tx.grn.update({
        where: { id },
        data: {
          ...(storeId !== undefined ? { storeId: Number(storeId) } : {}),
          ...(supplierId !== undefined ? { supplierId: Number(supplierId) } : {}),
          ...(invoiceNo !== undefined ? { invoiceNo: String(invoiceNo) } : {}),
          ...(invoiceDate !== undefined ? { invoiceDate: new Date(invoiceDate) } : {}),
          ...(paymentType !== undefined ? { paymentType: String(paymentType) } : {}),
          ...(transactionRefNo !== undefined ? { transactionRefNo: transactionRefNo || null } : {}),
          ...(receivedById !== undefined ? { receivedById: Number(receivedById) } : {}),
          ...(remarks !== undefined ? { remarks: remarks || null } : {}),
          ...(invoiceDiscount !== undefined ? { invoiceDiscount: resolvedInvoiceDiscount } : {}),
          ...(invoiceVat !== undefined ? { invoiceVat: resolvedInvoiceVat } : {}),
          ...(expiryAdjustmentAmount !== undefined ? { expiryAdjustmentAmount: resolvedExpiryAdjustmentAmount } : {}),
          ...(Array.isArray(items)
            ? { totalTradeValue, totalVat, totalDiscount, netAmount, avgGpPct, items: { create: pricedItems } }
            : {}),
        },
        include: { ...grnInclude, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.json(updated);
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid GRN id' });
  const shopId = req.shop!.id;
  const existing = await prisma.grn.findFirst({
    where: { id, shopId, purchaseOrderId: null },
    include: { items: true },
  });
  if (!existing) return res.status(404).json({ error: 'GRN not found' });
  if (existing.status === 'APPROVED') {
    const already = await prisma.grn.findUnique({
      where: { id },
      include: { ...grnInclude, items: { include: { product: true } } },
    });
    return res.json(already);
  }
  if (existing.status === 'CANCELED') {
    return res.status(400).json({ error: 'A canceled GRN cannot be approved' });
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
        include: { ...grnInclude, items: { include: { product: true } } },
      });
    },
    { timeout: 20000, maxWait: 10000 },
  );

  res.json(updated);
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid GRN id' });
  const shopId = req.shop!.id;
  const existing = await prisma.grn.findFirst({ where: { id, shopId, purchaseOrderId: null } });
  if (!existing) return res.status(404).json({ error: 'GRN not found' });
  if (existing.status !== 'UNAPPROVED') {
    return res.status(400).json({ error: 'Only an unapproved GRN can be canceled' });
  }

  const updated = await prisma.grn.update({
    where: { id },
    data: { status: 'CANCELED' },
    include: { ...grnInclude, items: { include: { product: true } } },
  });

  res.json(updated);
}));

export default router;
