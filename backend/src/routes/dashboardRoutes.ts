import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../asyncHandler';
import { requirePermission, requireShopAdmin } from '../auth';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// DASHBOARD
// =======================================================

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// Sales + collection aggregates for a shop (optionally one store) inside the
// [from, to] window. Collection only counts invoices with money actually paid,
// plus any RTV-credit adjustments (Adjust With PO / Adjustment With Others)
// approved in the same window — money the pharmacy keeps instead of paying
// out to a supplier is treated the same as cash collected that day.
// `withBreakdowns` additionally groups the mobile banking collection by
// provider (Bkash/Nagad/Rocket/...) and the card collection by card type
// (Brac_POS/City Amex_POS/...) — only requested for the period actually
// shown on the dashboard, so the extra queries aren't run for the unused
// daily/monthly/yearly summaries. Unlike the mobile breakdown (which is
// padded out to the full known provider list on the frontend), the card
// breakdown intentionally only returns card types that were actually used —
// 3 sales in 3 different card types shows exactly 3 rows, not the full list.
async function aggregateSales(
  shopId: number,
  storeId: number | undefined,
  from: Date,
  to: Date,
  withBreakdowns = false,
) {
  const where: any = { shopId, createdAt: { gte: from, lte: to } };
  if (storeId) where.storeId = storeId;

  const adjWhere: any = { shopId, status: 'APPROVED', approvedAt: { gte: from, lte: to } };
  if (storeId) adjWhere.storeId = storeId;

  // Due collections are counted on the day they were taken, not the day the
  // invoice was raised.
  //
  // Receiving a due also increments that invoice's own paid* columns, so those
  // columns alone put every payment on the sale's date: money collected today
  // against last week's invoice landed in last week and was missing from today.
  // Each collection is also its own dated row now, so the window's takings are
  //
  //   what those invoices were paid at the till
  //   - the part of that which was actually collected later as a due
  //   + the dues collected within this window, whatever their invoice's date
  //
  // Collections recorded before this was tracked have no row of their own and
  // stay attributed to the sale, which is the only date known for them.
  const dueOnWindowSalesWhere: any = { sale: { ...where } };
  const dueCollectedInWindowWhere: any = { shopId, createdAt: { gte: from, lte: to } };
  if (storeId) dueCollectedInWindowWhere.storeId = storeId;

  const [salesAgg, collectionAgg, adjWithPoAgg, adjOthersAgg, mobileBreakdownRaw, cardBreakdownRaw,
         dueOnWindowSales, dueCollected] = await Promise.all([
    prisma.sale.aggregate({ where, _sum: { netAmount: true }, _count: true }),
    prisma.sale.aggregate({
      where: { ...where, paidAmount: { gt: 0 } },
      _sum: { paidAmount: true, paidCash: true, paidMobileBanking: true, paidCard: true },
      _count: true,
    }),
    prisma.grn.aggregate({ where: { ...adjWhere, kind: 'ADJUST_WITH_PO' }, _sum: { rtvAdjustmentValue: true } }),
    prisma.adjOthers.aggregate({ where: adjWhere, _sum: { totalAdjustmentAmount: true } }),
    withBreakdowns
      ? prisma.sale.groupBy({
          by: ['mobileBankingType'],
          where: { ...where, paidMobileBanking: { gt: 0 } },
          _sum: { paidMobileBanking: true },
        })
      : Promise.resolve([]),
    withBreakdowns
      ? prisma.sale.groupBy({
          by: ['cardType'],
          where: { ...where, paidCard: { gt: 0 } },
          _sum: { paidCard: true },
        })
      : Promise.resolve([]),
    prisma.duePayment.aggregate({
      where: dueOnWindowSalesWhere,
      _sum: { amount: true, paidCash: true, paidMobileBanking: true, paidCard: true },
    }),
    prisma.duePayment.aggregate({
      where: dueCollectedInWindowWhere,
      _sum: { amount: true, paidCash: true, paidMobileBanking: true, paidCard: true },
      _count: true,
    }),
  ]);

  const adjustment = (adjWithPoAgg._sum.rtvAdjustmentValue || 0) + (adjOthersAgg._sum.totalAdjustmentAmount || 0);

  // Move each mode's due portion off the sale's date and onto the collection's.
  const shift = (atTill: number, laterDue: number, collectedNow: number) =>
    atTill - laterDue + collectedNow;

  const dueCollection = {
    total: dueCollected._sum.amount || 0,
    count: dueCollected._count,
    cash: dueCollected._sum.paidCash || 0,
    mobile: dueCollected._sum.paidMobileBanking || 0,
    card: dueCollected._sum.paidCard || 0,
  };

  const mobileByType = mobileBreakdownRaw
    .map((r) => ({ type: r.mobileBankingType || 'Not Specified', amount: r._sum.paidMobileBanking || 0 }))
    .sort((a, b) => b.amount - a.amount);

  const cardByType = cardBreakdownRaw
    .map((r) => ({ type: r.cardType || 'Not Specified', amount: r._sum.paidCard || 0 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    sales: { total: salesAgg._sum.netAmount || 0, invoiceCount: salesAgg._count },
    collection: {
      total: shift(
        collectionAgg._sum.paidAmount || 0,
        dueOnWindowSales._sum.amount || 0,
        dueCollection.total,
      ) + adjustment,
      invoiceCount: collectionAgg._count,
      cash: shift(collectionAgg._sum.paidCash || 0, dueOnWindowSales._sum.paidCash || 0, dueCollection.cash),
      mobile: shift(
        collectionAgg._sum.paidMobileBanking || 0,
        dueOnWindowSales._sum.paidMobileBanking || 0,
        dueCollection.mobile,
      ),
      card: shift(collectionAgg._sum.paidCard || 0, dueOnWindowSales._sum.paidCard || 0, dueCollection.card),
      adjustment,
      dueCollection,
      mobileByType,
      cardByType,
    },
  };
}

// Cost of goods sold for a shop (optionally one store) inside the [from, to]
// window — each sold line's batch purchase price times the quantity that's
// still actually sold (qty minus anything since removed via Invoice Item
// Cancel), same convention the Sales Report "Profit" sub-reports use.
export async function aggregateCogs(shopId: number, storeId: number | undefined, from: Date, to: Date): Promise<number> {
  const params: any[] = [shopId, from, to];
  let storeSql = '';
  if (storeId) {
    params.push(storeId);
    storeSql = 'AND s."storeId" = $4';
  }
  const rows = await prisma.$queryRawUnsafe<{ cogs: number }[]>(
    `SELECT COALESCE(SUM(b."purchasePrice" * GREATEST(si.qty - si."canceledQty", 0)), 0)::float as cogs
     FROM "SaleItem" si
     JOIN "Batch" b ON b.id = si."batchId"
     JOIN "Sale" s ON s.id = si."saleId"
     WHERE s."shopId" = $1 AND s."createdAt" >= $2 AND s."createdAt" <= $3 ${storeSql}`,
    ...params,
  );
  return rows[0]?.cogs || 0;
}

// Sales split between the Pharma and Non-Pharma departments, for the
// dashboard's category donut. Reads the department off the product rather than
// SaleItem.departmentSnapshot so a department renamed after the fact still
// groups correctly, and nets off cancelled quantities the same way
// aggregateCogs does.
export async function aggregateCategorySplit(
  shopId: number,
  storeId: number | undefined,
  from: Date,
  to: Date,
): Promise<{ departmentName: string; salesValue: number; qty: number; invoiceCount: number }[]> {
  const params: any[] = [shopId, from, to];
  let storeSql = '';
  if (storeId) {
    params.push(storeId);
    storeSql = 'AND s."storeId" = $4';
  }
  return prisma.$queryRawUnsafe(
    `SELECT d.name AS "departmentName",
            COALESCE(SUM(si.mrp * GREATEST(si.qty - si."canceledQty", 0)), 0)::float AS "salesValue",
            COALESCE(SUM(GREATEST(si.qty - si."canceledQty", 0)), 0)::int AS qty,
            COUNT(DISTINCT s.id)::int AS "invoiceCount"
     FROM "SaleItem" si
     JOIN "Sale" s ON s.id = si."saleId"
     JOIN "Product" p ON p.id = si."productId"
     JOIN "Department" d ON d.id = p."departmentId"
     WHERE s."shopId" = $1 AND s."createdAt" >= $2 AND s."createdAt" <= $3 ${storeSql}
     GROUP BY d.name
     ORDER BY "salesValue" DESC`,
    ...params,
  );
}

router.get('/dashboard', requirePermission('dashboard'), asyncHandler(async (req, res) => {
  const { storeId, from, to } = req.query;
  const shopId = req.shop!.id;
  const storeFilter = storeId ? Number(storeId) : undefined;

  const fromDate = from ? new Date(String(from)) : dayStart(new Date());
  const toDate = to ? new Date(`${String(to)}T23:59:59.999Z`) : new Date();
  const now = new Date();

  // Purchase/Payment now come from the GRN module: "purchase" is the net
  // value of approved GRNs; "payment" is what was actually paid out (any GRN
  // whose payment type is not on credit).
  const grnWhere: any = { shopId, status: 'APPROVED', approvedAt: { gte: fromDate, lte: toDate } };
  if (storeFilter) grnWhere.storeId = storeFilter;

  // One wave, not two. The GRN aggregates below don't depend on the sales ones
  // above, but they used to be awaited afterwards, so the page paid a second
  // full round trip to the database for nothing.
  const [filtered, today, month, year, cogs, categorySplit, purchaseAgg, paymentAgg] = await Promise.all([
    aggregateSales(shopId, storeFilter, fromDate, toDate, true), // true = also fetch mobile/card breakdowns
    aggregateSales(shopId, storeFilter, dayStart(now), new Date()),
    aggregateSales(shopId, storeFilter, new Date(now.getFullYear(), now.getMonth(), 1), new Date()),
    aggregateSales(shopId, storeFilter, new Date(now.getFullYear(), 0, 1), new Date()),
    aggregateCogs(shopId, storeFilter, fromDate, toDate),
    aggregateCategorySplit(shopId, storeFilter, fromDate, toDate),
    prisma.grn.aggregate({ where: grnWhere, _sum: { netAmount: true }, _count: true }),
    prisma.grn.aggregate({ where: { ...grnWhere, paymentType: { not: 'Credit' } }, _sum: { netAmount: true }, _count: true }),
  ]);

  res.json({
    ...filtered,
    daily: today,
    monthly: month,
    yearly: year,
    purchase: { total: purchaseAgg._sum.netAmount || 0, invoiceCount: purchaseAgg._count },
    payment: { total: paymentAgg._sum.netAmount || 0, invoiceCount: paymentAgg._count },
    profit: { total: filtered.sales.total - cogs, cogs, salesTotal: filtered.sales.total },
    categorySplit,
  });
}));

export default router;
