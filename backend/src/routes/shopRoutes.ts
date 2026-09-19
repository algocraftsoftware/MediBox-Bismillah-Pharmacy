import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../db';
<<<<<<< HEAD
import { requireAdminRole, requirePermission, requireShopAdmin } from '../auth';
=======
import { requireAdminRole, requireShopAdmin } from '../auth';
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// SHOP / SESSION
// =======================================================

<<<<<<< HEAD
router.get('/me', asyncHandler(async (req, res) => {
=======
router.get('/me', async (req, res) => {
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
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
<<<<<<< HEAD
}));

router.get('/admins', asyncHandler(async (req, res) => {
=======
});

router.get('/admins', async (req, res) => {
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  const admins = await prisma.shopAdmin.findMany({
    where: { shopId: req.shop!.id },
    select: { id: true, name: true, username: true },
    orderBy: { name: 'asc' },
  });
  res.json(admins);
<<<<<<< HEAD
}));
=======
});
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

// =======================================================
// SETTINGS — Admin-only username/password management for every account in
// this shop (its own included). Staff accounts are enrolled by the Super
// Admin elsewhere; this only ever edits credentials on existing accounts,
// never creates/removes/deactivates one.
// =======================================================

<<<<<<< HEAD
router.get('/settings/accounts', requireAdminRole, asyncHandler(async (req, res) => {
=======
router.get('/settings/accounts', requireAdminRole, async (req, res) => {
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  const accounts = await prisma.shopAdmin.findMany({
    where: { shopId: req.shop!.id },
    select: { id: true, name: true, username: true, role: true, status: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  res.json(accounts);
<<<<<<< HEAD
}));
=======
});
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

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

<<<<<<< HEAD
router.get('/stores', asyncHandler(async (req, res) => {
  const stores = await prisma.store.findMany({ where: { shopId: req.shop!.id }, orderBy: { name: 'asc' } });
  res.json(stores);
}));

router.post('/stores', asyncHandler(async (req, res) => {
=======
router.get('/stores', async (req, res) => {
  const stores = await prisma.store.findMany({ where: { shopId: req.shop!.id }, orderBy: { name: 'asc' } });
  res.json(stores);
});

router.post('/stores', async (req, res) => {
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  const { name, code, address, phone } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
  const store = await prisma.store.create({
    data: { shopId: req.shop!.id, name, code, address, phone },
  });
  await prisma.invoiceCounter.create({ data: { storeId: store.id, value: 0 } });
  res.status(201).json(store);
<<<<<<< HEAD
}));

router.get('/departments', asyncHandler(async (req, res) => {
=======
});

router.get('/departments', async (req, res) => {
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  const departments = await prisma.department.findMany({
    where: { shopId: req.shop!.id },
    include: { subDepartments: true },
    orderBy: { name: 'asc' },
  });
  res.json(departments);
<<<<<<< HEAD
}));

router.get('/suppliers', asyncHandler(async (req, res) => {
  const suppliers = await prisma.supplier.findMany({ where: { shopId: req.shop!.id }, orderBy: { name: 'asc' } });
  res.json(suppliers);
}));

// =======================================================
// CREATE VENDOR
//
// Adding a supplier the pharmacy has started buying from.
//
// Restricted to the pharmacy's own admin account rather than a grantable
// permission, the same way Settings is: adding a vendor is the admin's own
// housekeeping, and making it a tick-box would mean a new shop could not add
// its first vendor until someone granted it.
// =======================================================
router.post('/suppliers', requireAdminRole, asyncHandler(async (req, res) => {
  const shopId = req.shop!.id;
  const { name, contact, address, paymentMode } = req.body || {};

  const vendorName = String(name ?? '').trim();
  if (!vendorName) return res.status(400).json({ error: 'Vendor Name is required' });
  if (vendorName.length > 191) return res.status(400).json({ error: 'Vendor Name is too long (max 191 characters)' });

  // Names are unique per shop, and the check is case-insensitive so "Olympic"
  // and "olympic" cannot both be created and then be impossible to tell apart
  // in a dropdown.
  const clash = await prisma.supplier.findFirst({
    where: { shopId, name: { equals: vendorName, mode: 'insensitive' } },
    select: { name: true },
  });
  if (clash) return res.status(400).json({ error: `"${clash.name}" already exists as a vendor` });

  const text = (v: unknown) => {
    const t = String(v ?? '').trim();
    return t === '' ? null : t;
  };

  const supplier = await prisma.supplier.create({
    data: {
      shopId,
      name: vendorName,
      contact: text(contact),
      address: text(address),
      paymentMode: text(paymentMode),
    },
  });
  res.status(201).json(supplier);
}));
=======
});

router.get('/suppliers', async (req, res) => {
  const suppliers = await prisma.supplier.findMany({ where: { shopId: req.shop!.id }, orderBy: { name: 'asc' } });
  res.json(suppliers);
});
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

export default router;
