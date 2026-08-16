import { Router } from 'express';
import { prisma } from '../db';
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

  const [salesAgg, collectionAgg, adjWithPoAgg, adjOthersAgg, mobileBreakdownRaw, cardBreakdownRaw] = await Promise.all([
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
  ]);

  const adjustment = (adjWithPoAgg._sum.rtvAdjustmentValue || 0) + (adjOthersAgg._sum.totalAdjustmentAmount || 0);

  const mobileByType = mobileBreakdownRaw
    .map((r) => ({ type: r.mobileBankingType || 'Not Specified', amount: r._sum.paidMobileBanking || 0 }))
    .sort((a, b) => b.amount - a.amount);

  const cardByType = cardBreakdownRaw
    .map((r) => ({ type: r.cardType || 'Not Specified', amount: r._sum.paidCard || 0 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    sales: { total: salesAgg._sum.netAmount || 0, invoiceCount: salesAgg._count },
    collection: {
      total: (collectionAgg._sum.paidAmount || 0) + adjustment,
      invoiceCount: collectionAgg._count,
      cash: collectionAgg._sum.paidCash || 0,
      mobile: collectionAgg._sum.paidMobileBanking || 0,
      card: collectionAgg._sum.paidCard || 0,
      adjustment,
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

router.get('/dashboard', requirePermission('dashboard'), async (req, res) => {
  const { storeId, from, to } = req.query;
  const shopId = req.shop!.id;
  const storeFilter = storeId ? Number(storeId) : undefined;

  const fromDate = from ? new Date(String(from)) : dayStart(new Date());
  const toDate = to ? new Date(`${String(to)}T23:59:59.999Z`) : new Date();
  const now = new Date();

  const [filtered, today, month, year, cogs] = await Promise.all([
    aggregateSales(shopId, storeFilter, fromDate, toDate, true), // true = also fetch mobile/card breakdowns
    aggregateSales(shopId, storeFilter, dayStart(now), new Date()),
    aggregateSales(shopId, storeFilter, new Date(now.getFullYear(), now.getMonth(), 1), new Date()),
    aggregateSales(shopId, storeFilter, new Date(now.getFullYear(), 0, 1), new Date()),
    aggregateCogs(shopId, storeFilter, fromDate, toDate),
  ]);

  // Purchase/Payment now come from the GRN module: "purchase" is the net
  // value of approved GRNs; "payment" is what was actually paid out (any GRN
  // whose payment type is not on credit).
  const grnWhere: any = { shopId, status: 'APPROVED', approvedAt: { gte: fromDate, lte: toDate } };
  if (storeFilter) grnWhere.storeId = storeFilter;

  const [purchaseAgg, paymentAgg] = await Promise.all([
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
  });
});

export default router;
