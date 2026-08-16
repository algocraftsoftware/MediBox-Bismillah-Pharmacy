import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../db';
import { requireAdminRole, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// SHOP / SESSION
// =======================================================

router.get('/me', async (req, res) => {
  const admin = await prisma.shopAdmin.findUnique({ where: { id: req.auth!.sub as number } });
  res.json({
    admin: {
      id: admin!.id,
      name: admin!.name,
      username: admin!.username,
      role: admin!.role,
      permissions: admin!.permissions,
    },
    shop: req.shop,
  });
});

router.get('/admins', async (req, res) => {
  const admins = await prisma.shopAdmin.findMany({
    where: { shopId: req.shop!.id },
    select: { id: true, name: true, username: true },
    orderBy: { name: 'asc' },
  });
  res.json(admins);
});

// =======================================================
// SETTINGS — Admin-only username/password management for every account in
// this shop (its own included). Staff accounts are enrolled by the Super
// Admin elsewhere; this only ever edits credentials on existing accounts,
// never creates/removes/deactivates one.
// =======================================================

router.get('/settings/accounts', requireAdminRole, async (req, res) => {
  const accounts = await prisma.shopAdmin.findMany({
    where: { shopId: req.shop!.id },
    select: { id: true, name: true, username: true, role: true, status: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  res.json(accounts);
});

router.put('/settings/accounts/:id', requireAdminRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid account id' });
  const account = await prisma.shopAdmin.findFirst({ where: { id, shopId: req.shop!.id } });
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const { username, password } = req.body || {};
  if (!username && !password) {
    return res.status(400).json({ error: 'Provide a new username and/or password' });
  }
  if (username) {
    const clash = await prisma.shopAdmin.findFirst({
      where: { shopId: req.shop!.id, username: String(username), NOT: { id } },
    });
    if (clash) return res.status(409).json({ error: 'That username is already used in this shop' });
  }

  const updated = await prisma.shopAdmin.update({
    where: { id },
    data: {
      ...(username ? { username: String(username) } : {}),
      ...(password ? { passwordHash: await bcrypt.hash(String(password), 10) } : {}),
    },
    select: { id: true, name: true, username: true, role: true, status: true },
  });
  res.json(updated);
}));

// =======================================================
// ORGANIZATION: STORES / DEPARTMENTS / SUPPLIERS
// =======================================================

router.get('/stores', async (req, res) => {
  const stores = await prisma.store.findMany({ where: { shopId: req.shop!.id }, orderBy: { name: 'asc' } });
  res.json(stores);
});

router.post('/stores', async (req, res) => {
  const { name, code, address, phone } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  const store = await prisma.store.create({
    data: { shopId: req.shop!.id, name, code, address, phone },
  });
  await prisma.invoiceCounter.create({ data: { storeId: store.id, value: 0 } });
  res.status(201).json(store);
});

router.get('/departments', async (req, res) => {
  const departments = await prisma.department.findMany({
    where: { shopId: req.shop!.id },
    include: { subDepartments: true },
    orderBy: { name: 'asc' },
  });
  res.json(departments);
});

router.get('/suppliers', async (req, res) => {
  const suppliers = await prisma.supplier.findMany({ where: { shopId: req.shop!.id }, orderBy: { name: 'asc' } });
  res.json(suppliers);
});

export default router;
