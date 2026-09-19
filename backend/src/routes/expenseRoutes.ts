import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { adminSelect } from './purchaseRequisitionRoutes';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
router.use(requirePermission('expenses'));

// Daily/weekly/monthly/yearly are just date-range presets computed on the
// frontend and sent as from/to — the backend only ever needs a plain range.
router.get('/', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const shopId = req.shop!.id;

  const where: any = { shopId };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(`${String(to)}T23:59:59.999Z`);
  }

  const [rows, agg] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { createdBy: { select: adminSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);

  res.json({ rows, total: agg._sum.amount || 0 });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, amount } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Expense name is required' });
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }

  const expense = await prisma.expense.create({
    data: {
      shopId: req.shop!.id,
      name: String(name).trim(),
      amount: parsedAmount,
      createdById: req.auth!.sub as number,
    },
    include: { createdBy: { select: adminSelect } },
  });
  res.status(201).json(expense);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid expense id' });
  const existing = await prisma.expense.findFirst({ where: { id, shopId: req.shop!.id } });
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  const { name, amount } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Expense name is required' });
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }

  const expense = await prisma.expense.update({
    where: { id },
    data: { name: String(name).trim(), amount: parsedAmount },
    include: { createdBy: { select: adminSelect } },
  });
  res.json(expense);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid expense id' });
  const existing = await prisma.expense.findFirst({ where: { id, shopId: req.shop!.id } });
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  await prisma.expense.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
