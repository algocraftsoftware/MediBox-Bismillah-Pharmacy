import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { adminSelect } from './purchaseRequisitionRoutes';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('grn-with-po'));

export const grnInclude = {
  store: true,
  supplier: true,
  purchaseOrder: true,
  receivedBy: { select: adminSelect },
  createdBy: { select: adminSelect },
  approvedBy: { select: adminSelect },
} as const;

export function computeItem(
  input: {
    boxQty: number;
    rcvQtyBox: number;
    rcvQtyPieces: number;
    bonusQtyBox: number;
    bonusQtyPieces: number;
    tradePrice: number;
    mrp: number;
    vatAmt: number;
    discAmt: number;
    // GRN Without PO lets the user type the actual invoiced Total Value
    // directly (prices can differ purchase to purchase) — when present,
    // it's the source of truth for Unit Price instead of tradePrice*qty.
    totalValueOverride?: number;
  },
  opts?: { bonusAffectsPricing?: boolean },
) {
  const bonusAffectsPricing = opts?.bonusAffectsPricing ?? true;
  // rcvQtyBox and rcvQtyPieces are two synced views of the SAME received
  // quantity (mirrored client-side via the product's box size, the same
  // convention Purchase Requisition uses) — Pcs is the source of truth, not
  // an amount added on top of Box. Same for bonusQtyBox/bonusQtyPieces.
  const receivedPieces = input.rcvQtyPieces;
  const bonusPieces = input.bonusQtyPieces;
  // totalQtyPieces always includes bonus — it drives the stock increment at
  // approval. pricedQtyPieces excludes bonus when bonusAffectsPricing is
  // false, so bonus units grow stock without diluting unit price/GP.
  const totalQtyPieces = receivedPieces + bonusPieces;
  const pricedQtyPieces = bonusAffectsPricing ? totalQtyPieces : receivedPieces;
  const totalValue = input.totalValueOverride !== undefined ? input.totalValueOverride : input.tradePrice * pricedQtyPieces;
  const netTotal = totalValue + input.vatAmt - input.discAmt;
  const unitPrice = pricedQtyPieces > 0 ? netTotal / pricedQtyPieces : input.tradePrice;
  const gp = input.mrp - unitPrice;
  const gpPct = input.mrp > 0 ? (gp / input.mrp) * 100 : 0;
  return { totalQtyPieces, totalValue, netTotal, unitPrice, gp, gpPct };
}

export type GrnItemInput = {
  productId: number;
  rcvQtyBox?: number;
  rcvQtyPieces?: number;
  bonusQtyBox?: number;
  bonusQtyPieces?: number;
  totalValue?: number;
  vatAmt?: number;
  discAmt?: number;
  mrp?: number;
  batchNo?: string | null;
  expiryDate?: string | null;
};

export async function priceGrnItems(
  shopId: number,
  storeId: number,
  purchaseOrderId: number | null,
  items: GrnItemInput[],
  opts?: { bonusAffectsPricing?: boolean },
) {
  const productIds = items.map((i) => Number(i.productId));
  const [products, poItems, batches] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds }, shopId } }),
    purchaseOrderId
      ? prisma.purchaseRequisitionItem.findMany({
          where: { requisitionId: purchaseOrderId, productId: { in: productIds } },
        })
      : Promise.resolve([] as { productId: number; qtyPieces: number; ppPerPiece: number; mrpPerPiece: number }[]),
    prisma.batch.findMany({ where: { productId: { in: productIds }, storeId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const poItemByProductId = new Map(poItems.map((i) => [i.productId, i]));
  const batchByProductId = new Map<number, (typeof batches)[number]>();
  for (const b of batches) if (!batchByProductId.has(b.productId)) batchByProductId.set(b.productId, b);

  return items
    .filter((i) => productById.has(Number(i.productId)))
    .map((i) => {
      const product = productById.get(Number(i.productId))!;
      const poItem = poItemByProductId.get(product.id);
      const batch = batchByProductId.get(product.id);
      const tradePrice = poItem?.ppPerPiece ?? batch?.purchasePrice ?? 0;
      const mrp = i.mrp !== undefined ? Number(i.mrp) : poItem?.mrpPerPiece ?? batch?.mrp ?? 0;
      const rcvQtyBox = Math.max(0, Number(i.rcvQtyBox) || 0);
      const rcvQtyPieces = Math.max(0, Number(i.rcvQtyPieces) || 0);
      const bonusQtyBox = Math.max(0, Number(i.bonusQtyBox) || 0);
      const bonusQtyPieces = Math.max(0, Number(i.bonusQtyPieces) || 0);
      const vatAmt = Number(i.vatAmt) || 0;
      const discAmt = Number(i.discAmt) || 0;
      const totalValueOverride = i.totalValue !== undefined ? Number(i.totalValue) || 0 : undefined;
      const calc = computeItem(
        { boxQty: product.boxQty, rcvQtyBox, rcvQtyPieces, bonusQtyBox, bonusQtyPieces, tradePrice, mrp, vatAmt, discAmt, totalValueOverride },
        opts,
      );
      return {
        productId: product.id,
        displayCategorySnapshot: product.displayCategory,
        orderQtyPieces: poItem ? poItem.qtyPieces : 0,
        rcvQtyBox,
        rcvQtyPieces,
        bonusQtyBox,
        bonusQtyPieces,
        tradePrice,
        mrp,
        vatAmt,
        discAmt,
        batchNo: i.batchNo || null,
        expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
        ...calc,
      };
    });
}

// =======================================================
// PURCHASE ORDERS AVAILABLE TO RECEIVE AGAINST
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

// =======================================================
// PO ITEM PREVIEW — lets the New page show what a Purchase
// Order's items will look like (priced/store-scoped) as soon as
// Order No is picked, before the GRN is actually created.
// =======================================================

router.get('/purchase-orders/:id/items', asyncHandler(async (req, res) => {
  const poId = Number(req.params.id);
  const { storeId } = req.query;
  if (!Number.isInteger(poId)) return res.status(400).json({ error: 'Invalid PO id' });
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });
  const shopId = req.shop!.id;
  const po = await prisma.purchaseRequisition.findFirst({
    where: { id: poId, shopId, status: 'FINAL_APPROVED' },
    include: { items: { include: { product: true } } },
  });
  if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

  const priced = await priceGrnItems(
    shopId,
    Number(storeId),
    po.id,
    po.items.map((it) => ({ productId: it.productId, rcvQtyBox: it.qtyBox, rcvQtyPieces: it.qtyPieces })),
    { bonusAffectsPricing: false },
  );
  const productById = new Map(po.items.map((it) => [it.productId, it.product]));
  const withNames = priced.map((it) => {
    const product = productById.get(it.productId);
    return {
      ...it,
      itemCode: product?.externalCode ?? null,
      itemName: product?.name ?? "",
      genericName: product?.genericName ?? null,
      uom: product?.unit ?? "Pcs",
      packSize: product?.boxQty ?? 1,
    };
  });
  res.json(withNames);
}));

// =======================================================
// LIST / DETAIL
// =======================================================

router.get('/', asyncHandler(async (req, res) => {
  const { status, storeId, supplierId, search, from, to, page, pageSize } = req.query;
  const shopId = req.shop!.id;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  // GRN With PO shares the Grn/GrnItem tables with GRN Without PO
  // (purchaseOrderId null) and Adjust With PO (kind ADJUST_WITH_PO) — must
  // exclude both explicitly or this list shows every GRN in the shop.
  const where: any = { shopId, purchaseOrderId: { not: null }, kind: 'STANDARD' };
  if (status) where.status = String(status);
  if (storeId) where.storeId = Number(storeId);
  if (supplierId) where.supplierId = Number(supplierId);
  if (search) {
    const term = String(search);
    where.OR = [
      { transactionNo: { contains: term, mode: 'insensitive' } },
      { invoiceNo: { contains: term, mode: 'insensitive' } },
      { purchaseOrder: { orderNo: { contains: term, mode: 'insensitive' } } },
      { purchaseOrder: { requisitionNo: { contains: term, mode: 'insensitive' } } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(String(to));
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
    where: { id, shopId: req.shop!.id, purchaseOrderId: { not: null }, kind: 'STANDARD' },
    include: { ...grnInclude, items: { include: { product: true } } },
  });
  if (!grn) return res.status(404).json({ error: 'GRN not found' });
  res.json(grn);
}));

// =======================================================
// CREATE / UPDATE / APPROVE
// =======================================================

router.post('/', asyncHandler(async (req, res) => {
  const {
    storeId,
    supplierId,
    purchaseOrderId,
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

  if (!storeId || !supplierId || !invoiceNo || !invoiceDate || !paymentType) {
    return res
      .status(400)
      .json({ error: 'Store, Supplier, Invoice Number, Invoice Date, and Payment Type are required' });
  }

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });

  // Client-provided items win when given — the New page lets you preview and
  // edit a PO's item grid (qty/VAT/discount/batch/expiry) before SUBMIT, and
  // this is what carries those edits through. Falls back to a blind reseed
  // straight from the PO's own quantities for any caller that doesn't send
  // items (e.g. a bare create without previewing first).
  let seedItems: Awaited<ReturnType<typeof priceGrnItems>> = [];
  if (Array.isArray(items) && items.length > 0) {
    seedItems = await priceGrnItems(shopId, Number(storeId), purchaseOrderId ? Number(purchaseOrderId) : null, items, {
      bonusAffectsPricing: false,
    });
  } else if (purchaseOrderId) {
    const po = await prisma.purchaseRequisition.findFirst({
      where: { id: Number(purchaseOrderId), shopId, status: 'FINAL_APPROVED' },
      include: { items: true },
    });
    if (po) {
      seedItems = await priceGrnItems(
        shopId,
        Number(storeId),
        po.id,
        po.items.map((it) => ({
          productId: it.productId,
          rcvQtyBox: it.qtyBox,
          rcvQtyPieces: it.qtyPieces,
        })),
        { bonusAffectsPricing: false },
      );
    }
  }

  const resolvedExpiryAdjustmentAmount = Number(expiryAdjustmentAmount) || 0;
  const totalTradeValue = seedItems.reduce((a, i) => a + i.totalValue, 0);
  const totalVat = seedItems.reduce((a, i) => a + i.vatAmt, 0);
  const totalDiscount = seedItems.reduce((a, i) => a + i.discAmt, 0);
  const netAmount = seedItems.reduce((a, i) => a + i.netTotal, 0) - resolvedExpiryAdjustmentAmount;
  const avgGpPct = seedItems.length ? seedItems.reduce((a, i) => a + i.gpPct, 0) / seedItems.length : 0;

  const grn = await prisma.$transaction(
    async (tx) => {
      const counter = await tx.grnCounter.upsert({
        where: { shopId },
        update: { value: { increment: 1 } },
        create: { shopId, value: 1 },
      });
      const transactionNo = `GRN${String(counter.value).padStart(7, '0')}`;

      return tx.grn.create({
        data: {
          shopId,
          storeId: Number(storeId),
          supplierId: Number(supplierId),
          purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : null,
          transactionNo,
          invoiceNo: String(invoiceNo),
          invoiceDate: new Date(invoiceDate),
          paymentType: String(paymentType),
          transactionRefNo: transactionRefNo || null,
          receivedById: receivedById ? Number(receivedById) : null,
          remarks: remarks || null,
          invoiceDiscount: Number(invoiceDiscount) || 0,
          invoiceVat: Number(invoiceVat) || 0,
          expiryAdjustmentAmount: resolvedExpiryAdjustmentAmount,
          createdById: req.auth!.sub as number,
          totalTradeValue,
          totalVat,
          totalDiscount,
          netAmount,
          avgGpPct,
          items: { create: seedItems },
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
  const existing = await prisma.grn.findFirst({ where: { id, shopId, purchaseOrderId: { not: null }, kind: 'STANDARD' } });
  if (!existing) return res.status(404).json({ error: 'GRN not found' });
  if (existing.status === 'APPROVED') {
    return res.status(400).json({ error: 'An approved GRN can no longer be edited' });
  }

  const { invoiceNo, invoiceDate, paymentType, transactionRefNo, receivedById, remarks, invoiceDiscount, invoiceVat, expiryAdjustmentAmount, items, purchaseOrderId } =
    req.body || {};

  // Switching to a different PO (e.g. the wrong one of two from the same
  // supplier was picked at creation) re-seeds the item grid from scratch,
  // same as creating a fresh GRN against that PO — any items already staged
  // against the old PO don't carry over, since they belong to a different
  // order entirely.
  let poSwitch = false;
  let seededItems: Array<{ productId: number; rcvQtyBox: number; rcvQtyPieces: number }> = [];
  let targetPurchaseOrderId = existing.purchaseOrderId;
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

  // Client-provided items win when given (e.g. the caller already re-seeded
  // and let the receiver edit VAT/discount/batch before saving) — the auto
  // reseed from the new PO's own item list is only a fallback for a bare
  // "just switch the PO" call with no items attached.
  const pricedItems = Array.isArray(items)
    ? await priceGrnItems(shopId, existing.storeId, targetPurchaseOrderId, items, { bonusAffectsPricing: false })
    : poSwitch
    ? await priceGrnItems(shopId, existing.storeId, targetPurchaseOrderId, seededItems, { bonusAffectsPricing: false })
    : [];
  const replacesItems = poSwitch || Array.isArray(items);
  const totalTradeValue = pricedItems.reduce((a, i) => a + i.totalValue, 0);
  const totalVat = pricedItems.reduce((a, i) => a + i.vatAmt, 0);
  const totalDiscount = pricedItems.reduce((a, i) => a + i.discAmt, 0);
  const resolvedInvoiceDiscount = invoiceDiscount !== undefined ? Number(invoiceDiscount) || 0 : existing.invoiceDiscount;
  const resolvedInvoiceVat = invoiceVat !== undefined ? Number(invoiceVat) || 0 : existing.invoiceVat;
  const resolvedExpiryAdjustmentAmount =
    expiryAdjustmentAmount !== undefined ? Number(expiryAdjustmentAmount) || 0 : existing.expiryAdjustmentAmount;
  // invoiceDiscount/invoiceVat are staging inputs the CALCULATE button
  // spreads into each item's own discAmt/vatAmt (proportional to Total
  // Value) — those distributed amounts are what totalDiscount/totalVat/
  // netTotal above already sum, so they're kept here only for display/
  // audit on the saved record, not subtracted again.
  const netAmount = pricedItems.reduce((a, i) => a + i.netTotal, 0) - resolvedExpiryAdjustmentAmount;
  const avgGpPct = pricedItems.length ? pricedItems.reduce((a, i) => a + i.gpPct, 0) / pricedItems.length : 0;

  const updated = await prisma.$transaction(
    async (tx) => {
      if (replacesItems) {
        await tx.grnItem.deleteMany({ where: { grnId: id } });
      }
      return tx.grn.update({
        where: { id },
        data: {
          ...(invoiceNo !== undefined ? { invoiceNo: String(invoiceNo) } : {}),
          ...(invoiceDate !== undefined ? { invoiceDate: new Date(invoiceDate) } : {}),
          ...(paymentType !== undefined ? { paymentType: String(paymentType) } : {}),
          ...(transactionRefNo !== undefined ? { transactionRefNo: transactionRefNo || null } : {}),
          ...(receivedById !== undefined ? { receivedById: receivedById ? Number(receivedById) : null } : {}),
          ...(remarks !== undefined ? { remarks: remarks || null } : {}),
          ...(invoiceDiscount !== undefined ? { invoiceDiscount: resolvedInvoiceDiscount } : {}),
          ...(invoiceVat !== undefined ? { invoiceVat: resolvedInvoiceVat } : {}),
          ...(expiryAdjustmentAmount !== undefined ? { expiryAdjustmentAmount: resolvedExpiryAdjustmentAmount } : {}),
          ...(poSwitch ? { purchaseOrderId: targetPurchaseOrderId } : {}),
          ...(replacesItems
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
    where: { id, shopId, purchaseOrderId: { not: null }, kind: 'STANDARD' },
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

  if (!existing.paymentType) return res.status(400).json({ error: 'Payment Type is required' });
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

export default router;
