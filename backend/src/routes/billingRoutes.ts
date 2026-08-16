import { Router } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// PRODUCT / BATCH SEARCH (typeahead, tuned for 20k+ rows)
// =======================================================

router.get('/products/search', requirePermission('billing'), async (req, res) => {
  const { q, storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });
  const query = String(q || '').trim();
  if (query.length < 2) return res.json([]);

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      b.id as "batchId", b."batchNo", b."expiryDate", b.mrp, b."sellingPrice", b."purchasePrice",
      b."vatPct", b."discPct", b."stockQty", b.barcode,
      p.id as "productId", p.name as "productName", p."genericName", p.unit,
      p."isPrescriptionRequired", p."controlledClass", p."displayCategory",
      d.name as "departmentName",
      s.name as "supplierName"
    FROM "Batch" b
    JOIN "Product" p ON p.id = b."productId"
    JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN "Supplier" s ON s.id = p."defaultSupplierId"
    WHERE b."storeId" = ${Number(storeId)}
      AND p."shopId" = ${req.shop!.id}
      AND b."stockQty" > 0
      AND b."expiryDate" >= NOW()
      AND (p.name ILIKE ${'%' + query + '%'} OR p."genericName" ILIKE ${'%' + query + '%'} OR b.barcode = ${query})
    ORDER BY (p.name ILIKE ${query + '%'}) DESC, p.name ASC
    LIMIT 20
  `;
  res.json(rows);
});

router.get('/products/by-barcode/:barcode', requirePermission('billing'), async (req, res) => {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });

  const batch = await prisma.batch.findFirst({
    where: {
      barcode: req.params.barcode,
      storeId: Number(storeId),
      stockQty: { gt: 0 },
      expiryDate: { gte: new Date() },
      product: { shopId: req.shop!.id },
    },
    include: { product: { include: { department: true, defaultSupplier: true } } },
  });
  if (!batch) return res.status(404).json({ error: 'No product found for this barcode' });
  res.json(batch);
});

// =======================================================
// SALES / BILLING
// =======================================================

function resolveShift(): 'MORNING' | 'EVENING' {
  const hour = new Date().getHours();
  return hour < 15 ? 'MORNING' : 'EVENING';
}

// Minimum-margin policy, enforced on top of the absolute "never below
// purchase price" floor checked separately. Bands (as instructed):
//  - Milk/baby-food items: flat discount capped at ৳30 per line, no
//    percentage-margin check beyond that.
//  - VVIP: pharma capped at an 11.5% discount off the normal selling price;
//    non-pharma just needs to retain a flat ৳30+ gross profit per line.
//  - Everyone else (General/Employee/Other): pharma needs a resulting
//    margin of at least 3%, or 5% if the item's own undiscounted margin is
//    already ≥15%; non-pharma needs at least 13%, or 15% if its undiscounted
//    margin is already ≥20%. A narrow carve-out: items whose undiscounted
//    margin sits in the 5–8% band may take a flat ৳15–30 discount even if
//    that would otherwise dip under the percentage floor.
// Returns an error string (sale must be rejected) or null (allowed).
function evaluateMarginFloor(params: {
  custType: string;
  isPharma: boolean;
  isMilkOrBabyFood: boolean;
  purchasePrice: number;
  baselineSellingPrice: number;
  finalSellingPricePerUnit: number;
  qty: number;
  productName: string;
}): string | null {
  const { custType, isPharma, isMilkOrBabyFood, purchasePrice, baselineSellingPrice, finalSellingPricePerUnit, qty, productName } = params;
  if (purchasePrice <= 0 || baselineSellingPrice <= 0) return null;
  // Only a discount can trigger these bands — a normal full-price sale is
  // never blocked here even if the item's everyday margin sits under a
  // band's target (that's a catalog-pricing question, not a billing-time
  // one); the separate purchase-price floor above still always applies.
  if (finalSellingPricePerUnit >= baselineSellingPrice - 0.005) return null;

  const flatDiscountPerLine = (baselineSellingPrice - finalSellingPricePerUnit) * qty;
  const baselineGpPct = ((baselineSellingPrice - purchasePrice) / baselineSellingPrice) * 100;
  const finalGpPct = ((finalSellingPricePerUnit - purchasePrice) / finalSellingPricePerUnit) * 100;
  const flatProfitPerLine = (finalSellingPricePerUnit - purchasePrice) * qty;

  if (isMilkOrBabyFood) {
    if (flatDiscountPerLine > 30 + 0.01) {
      return `${productName}: discount exceeds the ৳30 cap for baby food/milk items`;
    }
    return null;
  }

  if (custType === 'VVIP') {
    if (isPharma) {
      const discPctApplied = ((baselineSellingPrice - finalSellingPricePerUnit) / baselineSellingPrice) * 100;
      if (discPctApplied > 11.5 + 0.01) {
        return `${productName}: VVIP discount on pharma items cannot exceed 11.5% (requested ${discPctApplied.toFixed(1)}%)`;
      }
    } else if (flatProfitPerLine < 30 - 0.01) {
      return `${productName}: VVIP non-pharma sale must retain at least ৳30 gross profit (would retain ৳${flatProfitPerLine.toFixed(2)})`;
    }
    return null;
  }

  if (baselineGpPct >= 5 && baselineGpPct <= 8 && flatDiscountPerLine <= 30 + 0.01) {
    return null;
  }

  if (isPharma) {
    const floor = baselineGpPct >= 15 ? 5 : 3;
    if (finalGpPct < floor - 0.01) {
      return `${productName}: discount would drop the margin to ${finalGpPct.toFixed(1)}%, below the ${floor}% minimum for pharma items`;
    }
  } else {
    const floor = baselineGpPct >= 20 ? 15 : 13;
    if (finalGpPct < floor - 0.01) {
      return `${productName}: discount would drop the margin to ${finalGpPct.toFixed(1)}%, below the ${floor}% minimum for non-pharma items`;
    }
  }
  return null;
}

router.post('/sales', requirePermission('billing'), asyncHandler(async (req, res) => {
  const {
    storeId,
    customerId,
    doctorName,
    doctorAddress,
    prescriptionId,
    consultationId,
    discountType,
    discAmt,
    discPct,
    adjustAmount,
    paidCash,
    paidMobileBanking,
    paidCard,
    mobileBankingType,
    transactionNumber,
    cardType,
    bankName,
    deliveryMode,
    deliveryType,
    remarks,
    items,
  } = req.body || {};

  if (!storeId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'storeId and at least one item are required' });
  }
  if ((Number(paidMobileBanking) || 0) > 0 && !mobileBankingType) {
    return res.status(400).json({ error: 'Mobile Banking Type is required when a Mobile Banking amount is entered' });
  }
  if ((Number(paidCard) || 0) > 0 && (!cardType || !bankName)) {
    return res.status(400).json({ error: 'Card Type and Bank Name are required when a Card Payment amount is entered' });
  }
  if (deliveryMode === 'DELIVERY' && !deliveryType) {
    return res.status(400).json({ error: 'Please select Delivery provider' });
  }

  const shopId = req.shop!.id;
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) return res.status(404).json({ error: 'Store not found in this shop' });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
      let itemAmount = 0;
      let vatAmount = 0;
      const lineData: any[] = [];
      const lineAmounts: number[] = [];
      const linePurchasePrices: number[] = [];

      const marginLineData: { productName: string; isPharma: boolean; isMilkOrBabyFood: boolean; baselineSellingPrice: number; purchasePrice: number; qty: number }[] = [];

      for (const line of items) {
        const batch = await tx.batch.findFirst({
          where: { id: Number(line.batchId), storeId: Number(storeId) },
          include: { product: { include: { department: true, subDepartment: true, defaultSupplier: true } } },
        });
        if (!batch) throw new Error(`Batch ${line.batchId} not found in this store`);
        const qty = Number(line.qty);
        if (!qty || qty <= 0) throw new Error('Item quantity must be greater than zero');
        if (!Number.isInteger(qty)) throw new Error(`Item quantity must be a whole number (got ${qty})`);
        if (batch.stockQty < qty) {
          throw new Error(`Insufficient stock for ${batch.product.name} (batch ${batch.batchNo}): have ${batch.stockQty}, need ${qty}`);
        }

        const isFree = Boolean(line.isFree);
        const lineAmount = isFree ? 0 : batch.sellingPrice * qty;
        const lineDiscAmt = isFree ? 0 : (lineAmount * batch.discPct) / 100;
        const lineVatAmt = isFree ? 0 : ((lineAmount - lineDiscAmt) * batch.vatPct) / 100;
        const lineTotal = lineAmount - lineDiscAmt + lineVatAmt;

        itemAmount += lineAmount;
        vatAmount += lineVatAmt;

        lineData.push({
          batchId: batch.id,
          productId: batch.productId,
          productNameSnapshot: batch.product.name,
          departmentSnapshot: batch.product.department.name,
          supplierSnapshot: batch.product.defaultSupplier?.name || null,
          batchNoSnapshot: batch.batchNo,
          uom: batch.product.unit,
          mrp: batch.mrp,
          qty,
          vatPct: batch.vatPct,
          vatAmt: lineVatAmt,
          discPct: batch.discPct,
          discAmt: lineDiscAmt,
          total: lineTotal,
          isFree,
          isPrdm: Boolean(line.isPrdm),
        });
        lineAmounts.push(lineAmount);
        linePurchasePrices.push(isFree ? 0 : batch.purchasePrice);
        // "Baby food or milk"-type items are matched by name — no dedicated
        // product flag exists yet, so this is a best-effort heuristic against
        // the sub-department (e.g. "Mother & Baby Care", "Baby Nutrition") and
        // the product's own name (e.g. "... Milk Powder ...").
        const categoryText = `${batch.product.subDepartment?.name || ''} ${batch.product.name}`.toLowerCase();
        marginLineData.push({
          productName: batch.product.name,
          isPharma: batch.product.department.name === 'Pharma',
          isMilkOrBabyFood: categoryText.includes('baby') || categoryText.includes('milk'),
          baselineSellingPrice: batch.sellingPrice,
          purchasePrice: isFree ? 0 : batch.purchasePrice,
          qty,
        });

        await tx.batch.update({ where: { id: batch.id }, data: { stockQty: { decrement: qty } } });
      }

      const totalAmount = itemAmount + vatAmount;
      const resolvedDiscAmt = discAmt != null ? Number(discAmt) : ((Number(discPct) || 0) * totalAmount) / 100;

      // The overall bill discount typed at the footer only reduced Sale.netAmount
      // above — it was never reflected on any individual SaleItem, so Invoice Item
      // Cancel's per-item Discount column always showed each batch's own (usually
      // zero) discPct, and a return refunded the full pre-discount price instead of
      // what the customer actually paid for that unit. Spread it proportionally by
      // each line's gross amount (last non-zero line absorbs the rounding remainder,
      // same rule proportionalSplit.ts uses on the frontend for GRN) and fold it into
      // that line's own discAmt/total.
      if (resolvedDiscAmt > 0 && lineData.length > 0) {
        const weights = lineAmounts;
        const weightSum = weights.reduce((a, w) => a + w, 0);
        if (weightSum > 0) {
          let remaining = resolvedDiscAmt;
          const lastIdx = weights.reduce((last, w, idx) => (w > 0 ? idx : last), -1);
          lineData.forEach((l, idx) => {
            const share = idx === lastIdx ? remaining : Math.round((resolvedDiscAmt * weights[idx]) / weightSum * 100) / 100;
            remaining -= share;
            l.discAmt += share;
            l.total -= share;
          });
        }
      }

      // Hard floor, independent of any discount rule: a product can never be
      // sold below its own purchase price, even via a manual discount override.
      lineData.forEach((l, idx) => {
        if (l.isFree || !l.qty) return;
        const purchasePrice = linePurchasePrices[idx];
        const sellingPricePerUnit = (lineAmounts[idx] - l.discAmt) / l.qty;
        if (sellingPricePerUnit < purchasePrice - 0.005) {
          throw new Error(
            `Cannot sell ${l.productNameSnapshot} below its purchase price (৳${purchasePrice.toFixed(2)}/unit) — discounted price would be ৳${sellingPricePerUnit.toFixed(2)}/unit`
          );
        }
      });

      const netAmount = Math.max(0, totalAmount - resolvedDiscAmt);
      // Round to nearest whole currency unit — matches the frontend rounding.
      const receivable = Math.round(netAmount);
      const resolvedAdjust = receivable - netAmount;
      const paidAmount = (Number(paidCash) || 0) + (Number(paidMobileBanking) || 0) + (Number(paidCard) || 0);

      if (paidAmount > receivable + 0.01) {
        throw new Error("Over amount, Can't Billing");
      }

      const dueAmount = Math.max(0, receivable - paidAmount);

      // Resolve the customer: an explicit selection, or an auto-created
      // walk-in with a sequential code and a fixed placeholder mobile —
      // mirrors how a real till assigns a running customer id to cash sales.
      let resolvedCustomer: { id: number; creditLimit: number; creditBalance: number; custType: string };
      if (customerId) {
        const cust = await tx.customer.findFirst({ where: { id: Number(customerId), shopId } });
        if (!cust) throw new Error('Selected customer not found');
        resolvedCustomer = cust;
      } else {
        const custCounter = await tx.customerCounter.update({
          where: { shopId },
          data: { value: { increment: 1 } },
        });
        const customerCode = String(custCounter.value).padStart(7, '0');
        resolvedCustomer = await tx.customer.create({
          data: {
            shopId,
            storeId: Number(storeId),
            customerCode,
            custType: 'GENERAL',
            name: 'WALK-IN CUSTOMER',
            mobile: '00000000000',
          },
        });
      }

      // Discount/profit-margin policy — checked once the customer's type is
      // known, using each line's already-finalized (post-distribution)
      // per-unit price. Independent of, and in addition to, the absolute
      // purchase-price floor checked above.
      lineData.forEach((l, idx) => {
        if (l.isFree || !l.qty) return;
        const m = marginLineData[idx];
        const finalSellingPricePerUnit = (lineAmounts[idx] - l.discAmt) / l.qty;
        const violation = evaluateMarginFloor({
          custType: resolvedCustomer.custType,
          isPharma: m.isPharma,
          isMilkOrBabyFood: m.isMilkOrBabyFood,
          purchasePrice: m.purchasePrice,
          baselineSellingPrice: m.baselineSellingPrice,
          finalSellingPricePerUnit,
          qty: m.qty,
          productName: m.productName,
        });
        if (violation) throw new Error(violation);
      });

      // A bill only ever goes onto a customer's account as a due when the
      // account is allowed credit: a credit limit is set AND the new due plus
      // what the customer already owes stays within that limit. A fully paid
      // bill (no due) is never blocked by the credit rules — cash/mobile/card
      // paid sales must always save, for walk-ins and credit-ineligible
      // customers alike.
      if (dueAmount > 0.01) {
        if (resolvedCustomer.creditLimit <= 0) {
          throw new Error('This customer not eligible for Credit billing, Please fill the amount section');
        }
        const availableCredit = resolvedCustomer.creditLimit - (resolvedCustomer.creditBalance || 0);
        if (dueAmount > availableCredit + 0.01) {
          throw new Error("Credit Limit Over, Can't Process The Bill");
        }
      }

      const counter = await tx.invoiceCounter.update({
        where: { storeId: Number(storeId) },
        data: { value: { increment: 1 } },
      });
      const invoiceNo = `INV-${new Date().getFullYear()}-${String(counter.value).padStart(6, '0')}`;

      const sale = await tx.sale.create({
        data: {
          shopId,
          storeId: Number(storeId),
          invoiceNo,
          customerId: resolvedCustomer.id,
          cashierId: req.auth!.sub as number,
          doctorName: doctorName || null,
          doctorAddress: doctorAddress || null,
          prescriptionId: prescriptionId || null,
          consultationId: consultationId || null,
          discountType: discountType || 'General Discount',
          discAmt: resolvedDiscAmt,
          discPct: Number(discPct) || 0,
          itemAmount,
          vatAmount,
          totalAmount,
          netAmount,
          adjustAmount: resolvedAdjust,
          receivable,
          paidCash: Number(paidCash) || 0,
          paidMobileBanking: Number(paidMobileBanking) || 0,
          paidCard: Number(paidCard) || 0,
          mobileBankingType: mobileBankingType || null,
          transactionNumber: transactionNumber || null,
          cardType: cardType || null,
          bankName: bankName || null,
          paidAmount,
          dueAmount,
          paymentStatus: dueAmount > 0 ? 'DUE' : 'PAID',
          deliveryMode: deliveryMode || 'PICKUP',
          deliveryType: deliveryMode === 'DELIVERY' ? deliveryType || null : null,
          remarks,
          shift: resolveShift(),
          items: { create: lineData },
        },
        include: {
          items: true,
          customer: true,
          store: true,
          cashier: { select: { id: true, name: true, username: true } },
        },
      });

      const setting = await tx.shopSetting.findUnique({ where: { shopId } });
      const rewardEarned = (netAmount * (setting?.rewardEarnRatePct || 0)) / 100;
      if (rewardEarned > 0) {
        await tx.customer.update({
          where: { id: resolvedCustomer.id },
          data: { rewardBalance: { increment: rewardEarned } },
        });
      }

      // Track the outstanding credit: the due goes onto the customer's balance
      // so their remaining available credit (creditLimit - creditBalance)
      // shrinks by this sale's due, and is restored again when they pay it off.
      if (dueAmount > 0.01) {
        await tx.customer.update({
          where: { id: resolvedCustomer.id },
          data: { creditBalance: { increment: dueAmount } },
        });
      }

      return sale;
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not complete sale' });
  }
}));

// Shared filter builder for the Invoice List — search by customer id/mobile/
// EID-PF match the SAME customer record, so they're OR'd together the same
// way the Customer Registration filter bar treats them.
function buildInvoiceListWhere(shopId: number, query: Record<string, any>): any {
  const { storeId, orgName, custType, userId, custId, mobile, eidpf, invoiceNo, from, to, dueOnly } = query;
  const where: any = { shopId };
  if (storeId) where.storeId = Number(storeId);
  if (userId) where.cashierId = Number(userId);
  if (invoiceNo) where.invoiceNo = { contains: String(invoiceNo), mode: 'insensitive' };
  if (dueOnly) where.dueAmount = { gt: 0.01 };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(`${String(to)}T23:59:59.999Z`);
  }
  const customerFilters: any = {};
  if (orgName) customerFilters.orgName = String(orgName);
  if (custType) customerFilters.custType = String(custType);
  if (custId) customerFilters.customerCode = { contains: String(custId), mode: 'insensitive' };
  if (mobile) customerFilters.mobile = { contains: String(mobile) };
  if (eidpf) customerFilters.employeeId = { contains: String(eidpf), mode: 'insensitive' };
  if (Object.keys(customerFilters).length > 0) where.customer = { is: customerFilters };
  return where;
}

router.get('/sales', requirePermission('sales-report', 'invoice-list'), asyncHandler(async (req, res) => {
  const shopId = req.shop!.id;
  const { page, pageSize } = req.query;
  const where = buildInvoiceListWhere(shopId, req.query as Record<string, any>);
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));

  const [rows, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: true, customer: true, store: true, cashier: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * size,
      take: size,
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ rows, total, page: pageNum, pageSize: size });
}));

router.get('/sales/organizations', requirePermission('sales-report', 'invoice-list'), asyncHandler(async (req, res) => {
  const rows = await prisma.customer.findMany({
    where: { shopId: req.shop!.id, orgName: { not: null } },
    select: { orgName: true },
    distinct: ['orgName'],
    orderBy: { orgName: 'asc' },
  });
  res.json(rows.map((r) => r.orgName).filter((v): v is string => Boolean(v && v.trim())));
}));

router.get('/sales/export', requirePermission('sales-report', 'invoice-list'), asyncHandler(async (req, res) => {
  const shopId = req.shop!.id;
  const where = buildInvoiceListWhere(shopId, req.query as Record<string, any>);
  const sales = await prisma.sale.findMany({
    where,
    include: { customer: true, store: true, cashier: { select: { id: true, name: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const rows = sales.map((s) => ({
    'Invoice No': s.invoiceNo,
    'Invoice Date': s.createdAt.toISOString(),
    'Customer ID': s.customer?.customerCode || '',
    'Customer Name': s.customer?.name || '',
    'Customer Type': s.customer?.custType || '',
    'Contact No': s.customer?.mobile || '',
    'EID/PF No': s.customer?.employeeId || '',
    Organization: s.customer?.orgName || '',
    'Doctor Name': s.doctorName || '',
    'Doctor Address': s.doctorAddress || '',
    'Self/HD': s.deliveryMode === 'DELIVERY' ? 'HD' : 'Self',
    Remarks: s.remarks || '',
    Store: s.store?.name || '',
    User: s.cashier?.name || '',
    Discount: s.discAmt,
    'Discount(%)': s.discPct,
    'Paid Amt': s.paidAmount,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoice List');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="invoice-list.xlsx"');
  res.send(buffer);
}));

// Must be registered before GET /sales/:id — otherwise Express matches
// "by-invoice-no" as the :id param (Number("by-invoice-no") is NaN) and this
// handler is never reached, same route-ordering pitfall already fixed once
// for the Employee Salary routes.
router.get('/sales/by-invoice-no', requirePermission('invoice-item-cancel'), asyncHandler(async (req, res) => {
  const { invoiceNo } = req.query;
  if (!invoiceNo) return res.status(400).json({ error: 'invoiceNo is required' });
  // Trim stray whitespace so a pasted invoice number (which can carry
  // leading/trailing spaces from wherever it was copied) still matches.
  const cleanInvoiceNo = String(invoiceNo).trim();
  const sale = await prisma.sale.findFirst({
    where: { shopId: req.shop!.id, invoiceNo: cleanInvoiceNo },
    orderBy: { createdAt: 'desc' },
    include: saleCancelInclude,
  });
  if (!sale) return res.status(404).json({ error: 'Invoice not found' });
  res.json(withRemainingQty(sale));
}));

router.get('/sales/:id', requirePermission('sales-report', 'invoice-list', 'billing'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid sale id' });
  const sale = await prisma.sale.findFirst({
    where: { id, shopId: req.shop!.id },
    include: { items: true, customer: true, store: true, cashier: { select: { id: true, name: true, username: true } } },
  });
  if (!sale) return res.status(404).json({ error: 'Invoice not found' });
  res.json(sale);
}));

// Collect a payment against a DUE invoice. The sale's payment breakdown and
// due amount are updated, and the customer's outstanding credit balance is
// reduced by the collected amount — restoring their available credit
// (creditLimit - creditBalance) so future due bills can be approved again.
router.post('/sales/:id/receive', requirePermission('invoice-list', 'billing'), asyncHandler(async (req, res) => {
  const saleId = Number(req.params.id);
  const shopId = req.shop!.id;
  const {
    paidCash,
    paidMobileBanking,
    paidCard,
    mobileBankingType,
    transactionNumber,
    cardType,
    bankName,
    remarks,
  } = req.body || {};

  if (!Number.isInteger(saleId)) return res.status(400).json({ error: 'Invalid sale id' });

  if ((Number(paidMobileBanking) || 0) > 0 && !mobileBankingType) {
    return res.status(400).json({ error: 'Mobile Banking Type is required when a Mobile Banking amount is entered' });
  }
  if ((Number(paidCard) || 0) > 0 && (!cardType || !bankName)) {
    return res.status(400).json({ error: 'Card Type and Bank Name are required when a Card Payment amount is entered' });
  }

  const received = (Number(paidCash) || 0) + (Number(paidMobileBanking) || 0) + (Number(paidCard) || 0);
  if (received <= 0) {
    return res.status(400).json({ error: 'Enter a payment amount to receive' });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: saleId, shopId },
          include: { customer: true },
        });
        if (!sale) throw new Error('Invoice not found');
        if (sale.paymentStatus === 'PAID' || sale.dueAmount <= 0.01) {
          throw new Error('This invoice has no outstanding due amount');
        }
        if (received > sale.dueAmount + 0.01) {
          throw new Error(`Payment exceeds the due amount (${sale.dueAmount.toFixed(2)}) on this invoice`);
        }

        const newDue = Math.max(0, Math.round((sale.dueAmount - received) * 100) / 100);
        const updated = await tx.sale.update({
          where: { id: sale.id },
          data: {
            paidAmount: { increment: received },
            paidCash: { increment: Number(paidCash) || 0 },
            paidMobileBanking: { increment: Number(paidMobileBanking) || 0 },
            paidCard: { increment: Number(paidCard) || 0 },
            ...(mobileBankingType ? { mobileBankingType } : {}),
            ...(transactionNumber ? { transactionNumber } : {}),
            ...(cardType ? { cardType } : {}),
            ...(bankName ? { bankName } : {}),
            ...(remarks ? { remarks } : {}),
            dueAmount: newDue,
            paymentStatus: newDue <= 0.01 ? 'PAID' : 'DUE',
          },
          include: {
            items: true,
            customer: true,
            store: true,
            cashier: { select: { id: true, name: true, username: true } },
          },
        });

        if (sale.customerId && received > 0) {
          const newBalance = Math.max(0, (sale.customer?.creditBalance || 0) - received);
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { creditBalance: newBalance },
          });
        }

        // Re-read the customer so the response carries the updated credit
        // balance (the sale include above snapshots it before the decrement).
        if (sale.customerId) {
          const freshCustomer = await tx.customer.findUnique({ where: { id: sale.customerId } });
          if (freshCustomer) updated.customer = freshCustomer;
        }

        return updated;
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not receive payment' });
  }
}));

// =======================================================
// INVOICE ITEM CANCEL
// =======================================================

const saleCancelInclude = {
  items: { include: { product: true, batch: true, cancellations: true } },
  customer: true,
  store: true,
  cashier: { select: { id: true, name: true, username: true } },
} as const;

function withRemainingQty<T extends { items: { qty: number; canceledQty: number }[] }>(sale: T) {
  return {
    ...sale,
    items: sale.items.map((it) => ({ ...it, remainingQty: it.qty - it.canceledQty })),
  };
}

router.post('/sales/:id/cancel-items', requirePermission('invoice-item-cancel'), asyncHandler(async (req, res) => {
  const saleId = Number(req.params.id);
  if (!Number.isInteger(saleId)) return res.status(400).json({ error: 'Invalid sale id' });
  const { reason, items } = req.body || {};
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Cancel Reason is required' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Select at least one item to cancel' });
  }

  const shopId = req.shop!.id;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findFirst({ where: { id: saleId, shopId }, include: { items: true } });
        if (!sale) throw new Error('Invoice not found');

        const saleItemById = new Map(sale.items.map((it) => [it.id, it]));
        let removedGrossPlusVat = 0;
        let removedDisc = 0;
        let removedNet = 0;

        for (const line of items) {
          const saleItem = saleItemById.get(Number(line.saleItemId));
          if (!saleItem) throw new Error(`Item ${line.saleItemId} does not belong to this invoice`);
          const qty = Number(line.qty);
          const remaining = saleItem.qty - saleItem.canceledQty;
          if (!qty || qty <= 0) throw new Error('Cancel quantity must be greater than zero');
          if (!Number.isInteger(qty)) throw new Error(`Cancel quantity must be a whole number (got ${qty})`);
          if (qty > remaining) {
            throw new Error(`Cannot cancel ${qty} of ${saleItem.productNameSnapshot} — only ${remaining} remaining`);
          }

          const ratio = qty / saleItem.qty;
          const netAmt = saleItem.total * ratio;
          const vatAmt = saleItem.vatAmt * ratio;
          const discAmt = saleItem.discAmt * ratio;
          const grossAmt = netAmt - vatAmt + discAmt;
          const refundAmt = 0; // resolved at the sale level below (capped at what remains paid)

          await tx.saleItemCancellation.create({
            data: {
              saleItemId: saleItem.id,
              saleId: sale.id,
              qty,
              grossAmt,
              vatAmt,
              discAmt,
              netAmt,
              refundAmt,
              reason: String(reason).trim(),
              canceledById: req.auth!.sub as number,
            },
          });
          await tx.saleItem.update({ where: { id: saleItem.id }, data: { canceledQty: { increment: qty } } });
          await tx.batch.update({ where: { id: saleItem.batchId }, data: { stockQty: { increment: qty } } });

          removedGrossPlusVat += grossAmt + vatAmt;
          removedDisc += discAmt;
          removedNet += netAmt;
        }

        const newTotalAmount = sale.totalAmount - removedGrossPlusVat;
        const newDiscAmt = sale.discAmt - removedDisc;
        const newNetAmount = Math.max(0, newTotalAmount - newDiscAmt);
        // Same rounding policy as billing creation: round to the nearest
        // whole currency unit and absorb the tiny difference as an
        // adjustment, rather than ever tracking it as due. Re-deriving this
        // here (instead of recomputing due straight off the raw netAmount)
        // is what stops a billing-time adjustment (e.g. ৳0.27, written off
        // and never owed) from reappearing as due once an item is returned.
        const newReceivable = Math.round(newNetAmount);
        const refund = Math.min(sale.paidAmount, removedNet);
        const newPaidAmount = sale.paidAmount - refund;
        // Refunding a proportional (raw, unrounded) share of the returned
        // items can leave a sub-currency-unit residue between receivable and
        // what's now paid — that's rounding dust, not a real amount owed, so
        // it's floored away (never rounded up into a new due) and folded
        // into the adjustment, same as the original billing-time rounding.
        const rawDue = Math.max(0, newReceivable - newPaidAmount);
        const newDueAmount = Math.floor(rawDue);
        const newAdjustAmount = newReceivable - newNetAmount + (rawDue - newDueAmount);

        await tx.sale.update({
          where: { id: sale.id },
          data: {
            totalAmount: newTotalAmount,
            discAmt: newDiscAmt,
            netAmount: newNetAmount,
            adjustAmount: newAdjustAmount,
            receivable: newReceivable,
            paidAmount: newPaidAmount,
            dueAmount: newDueAmount,
            refundAmount: { increment: refund },
            paymentStatus: newDueAmount > 0.01 ? 'DUE' : 'PAID',
          },
        });

        const updated = await tx.sale.findUnique({ where: { id: sale.id }, include: saleCancelInclude });
        return withRemainingQty(updated!);
      },
      { timeout: 20000, maxWait: 10000 },
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not cancel item(s)' });
  }
}));

export default router;
