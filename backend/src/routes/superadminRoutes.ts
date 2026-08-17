import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../db';
import { requireSuperAdmin } from '../auth';
import { uploadLogo } from '../uploads';
import { uploadLogoBuffer, uploadSignatureBuffer } from '../cloudinary';
import { cloneMedicineCatalog } from '../catalogClone';
import { aggregateCogs } from './dashboardRoutes';

// Permission lists reach this file two different ways: the shop create/update
// routes are multipart, so their `adminPermissions`/`staffPermissions` fields
// arrive as a JSON *string*, while the staff routes are plain JSON bodies and
// arrive as a real array. Handle both — treating an array as a string
// (`String(["billing"])` -> `"billing"`) throws in JSON.parse and used to fall
// through to `[]`, silently wiping every feature the Super Admin had ticked.
function parsePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const router = Router();
router.use(requireSuperAdmin);

// Tracks which shops currently have a catalog clone running, so the enroll
// route and the dashboard's self-heal don't fire duplicate copies.
const cloneInFlight = new Set<number>();

// Kick off a medicine-catalog clone in the background. The enroll response
// must not wait for a ~17k-row copy (tens of seconds would blow past a
// serverless function's timeout), so it's fired after responding — and if a
// serverless runtime freezes the function before it finishes, the dashboard's
// self-heal below retries it on the next visit.
function triggerCatalogClone(shopId: number, storeId: number) {
  if (cloneInFlight.has(shopId)) return;
  cloneInFlight.add(shopId);
  cloneMedicineCatalog(shopId, storeId)
    .then((r) => {
      cloneInFlight.delete(shopId);
      console.log(
        `Catalog clone complete for shop ${shopId} (from template ${r.templateShopId}): ${r.productsCloned} products, ${r.batchesCloned} batches`,
      );
    })
    .catch((err) => {
      cloneInFlight.delete(shopId);
      console.error(`Catalog clone failed for shop ${shopId}:`, err);
    });
}

router.get('/shops', async (_req, res) => {
  const shops = await prisma.shop.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { stores: true, admins: true, products: true } },
    },
  });

  // One groupBy for every shop's sales totals instead of a per-shop
  // aggregate query — N round-trips to a cold Neon connection was the main
  // reason this list was slow to load.
  const salesByShop = await prisma.sale.groupBy({
    by: ['shopId'],
    _sum: { netAmount: true },
    _count: true,
  });
  const salesMap = new Map(salesByShop.map((s) => [s.shopId, s]));

  const withTotals = shops.map((shop) => {
    const agg = salesMap.get(shop.id);
    return {
      id: shop.id,
      code: shop.code,
      name: shop.name,
      slug: shop.slug,
      logoUrl: shop.logoUrl,
      status: shop.status,
      createdAt: shop.createdAt,
      storeCount: shop._count.stores,
      adminCount: shop._count.admins,
      productCount: shop._count.products,
      totalSales: agg?._sum.netAmount || 0,
      totalOrders: agg?._count || 0,
    };
  });

  // Self-heal: a brand-new shop whose catalog clone was interrupted (e.g. the
  // serverless function froze right after the enroll response) has 0 products.
  // Retry the clone in the background so the medicines still land. Harmless
  // no-op when the shop already has products or a clone is already running.
  await Promise.all(
    withTotals
      .filter((s) => s.productCount === 0 && !cloneInFlight.has(s.id))
      .map(async (s) => {
        const store = await prisma.store.findFirst({ where: { shopId: s.id }, orderBy: { id: 'asc' } });
        if (store) triggerCatalogClone(s.id, store.id);
      })
  );

  res.json(withTotals);
});

router.get('/stats', async (req, res) => {
  const { from, to } = req.query;
  const where: any = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(`${String(to)}T23:59:59.999Z`);
  }

  const [shopCount, productCount, batchCount, salesAgg, collectionAgg] = await Promise.all([
    prisma.shop.count(),
    prisma.product.count(),
    prisma.batch.count(),
    prisma.sale.aggregate({ where, _sum: { netAmount: true }, _count: true }),
    prisma.sale.aggregate({
      where: { ...where, paidAmount: { gt: 0 } },
      _sum: { paidAmount: true, paidCash: true, paidMobileBanking: true, paidCard: true },
      _count: true,
    }),
  ]);

  res.json({ 
    shopCount, 
    productCount, 
    batchCount,
    sales: { total: salesAgg._sum.netAmount || 0, invoiceCount: salesAgg._count },
    collection: {
      total: collectionAgg._sum.paidAmount || 0,
      invoiceCount: collectionAgg._count,
      cash: collectionAgg._sum.paidCash || 0,
      mobile: collectionAgg._sum.paidMobileBanking || 0,
      card: collectionAgg._sum.paidCard || 0,
    }
  });
});

const uploadShopImages = uploadLogo.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'signaturePreparedBy', maxCount: 1 },
  { name: 'signatureReviewedBy', maxCount: 1 },
  { name: 'signatureApprovedBy', maxCount: 1 },
]);

router.post('/shops', uploadShopImages, async (req, res) => {
  const {
    code,
    name,
    slug,
    address,
    phone,
    adminUsername,
    adminPassword,
    adminName,
    adminPermissions,
    staffUsername,
    staffPassword,
    staffName,
    staffPermissions,
  } = req.body || {};

  if (
    !code ||
    !name ||
    !slug ||
    !adminUsername ||
    !adminPassword ||
    !adminName ||
    !staffUsername ||
    !staffPassword ||
    !staffName
  ) {
    return res.status(400).json({
      error:
        'Shop ID, name, slug, and both the Admin and Staff account details (name/username/password) are required',
    });
  }
  if (String(adminUsername).toLowerCase() === String(staffUsername).toLowerCase()) {
    return res.status(400).json({ error: 'Admin and Staff usernames must be different' });
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const existingCode = await prisma.shop.findUnique({ where: { code: normalizedCode } });
  if (existingCode) {
    return res.status(409).json({ error: 'That Shop ID is already in use' });
  }

  const normalizedSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!normalizedSlug) return res.status(400).json({ error: 'Invalid shop URL slug' });
  const existing = await prisma.shop.findUnique({ where: { slug: normalizedSlug } });
  if (existing) {
    return res.status(409).json({ error: 'That shop URL slug is already taken' });
  }

  const [adminPasswordHash, staffPasswordHash] = await Promise.all([
    bcrypt.hash(adminPassword, 10),
    bcrypt.hash(staffPassword, 10),
  ]);
  const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
  const logoFile = files?.logo?.[0];
  const preparedByFile = files?.signaturePreparedBy?.[0];
  const reviewedByFile = files?.signatureReviewedBy?.[0];
  const approvedByFile = files?.signatureApprovedBy?.[0];
  const [logoUrl, preparedBySignatureUrl, reviewedBySignatureUrl, approvedBySignatureUrl] = await Promise.all([
    logoFile ? uploadLogoBuffer(logoFile.buffer, logoFile.mimetype) : Promise.resolve(null),
    preparedByFile ? uploadSignatureBuffer(preparedByFile.buffer, preparedByFile.mimetype) : Promise.resolve(null),
    reviewedByFile ? uploadSignatureBuffer(reviewedByFile.buffer, reviewedByFile.mimetype) : Promise.resolve(null),
    approvedByFile ? uploadSignatureBuffer(approvedByFile.buffer, approvedByFile.mimetype) : Promise.resolve(null),
  ]);

  const { shop, storeId } = await prisma.$transaction(async (tx) => {
    const createdShop = await tx.shop.create({
      data: {
        code: normalizedCode,
        name,
        slug: normalizedSlug,
        logoUrl,
        preparedBySignatureUrl,
        reviewedBySignatureUrl,
        approvedBySignatureUrl,
        address: address ? String(address).trim() : null,
        phone: phone ? String(phone).trim() : null,
      },
    });
    await tx.shopAdmin.create({
      data: {
        shopId: createdShop.id,
        username: adminUsername,
        passwordHash: adminPasswordHash,
        name: adminName,
        role: 'ADMIN',
        permissions: parsePermissions(adminPermissions),
      },
    });
    await tx.shopAdmin.create({
      data: {
        shopId: createdShop.id,
        username: staffUsername,
        passwordHash: staffPasswordHash,
        name: staffName,
        role: 'STAFF',
        permissions: parsePermissions(staffPermissions),
      },
    });
    await tx.shopSetting.create({ data: { shopId: createdShop.id } });
    await tx.customerCounter.create({ data: { shopId: createdShop.id, value: 0 } });
    const store = await tx.store.create({
      data: { shopId: createdShop.id, name: 'Main Store', code: 'MAIN01' },
    });
    await tx.invoiceCounter.create({ data: { storeId: store.id, value: 0 } });
    return { shop: createdShop, storeId: store.id };
  });

  // Clone the full medicine catalog into the new shop. Not part of the
  // transaction above, and not awaited either — blocking the enrollment
  // response on a ~17k-row copy would keep the request open for many seconds.
  // The shop is fully usable the moment this response returns; medicines
  // appear in the Stock Data screen as the clone lands.
  triggerCatalogClone(shop.id, storeId);

  res.status(201).json(shop);
});

router.patch('/shops/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const shop = await prisma.shop.findUnique({ where: { id } });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const updated = await prisma.shop.update({
    where: { id },
    data: { status: shop.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
  });
  res.json(updated);
});

// Full shop details (with its admin + staff accounts) for the super admin edit form.
router.get('/shops/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid shop id' });
  const shop = await prisma.shop.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      admins: { select: { id: true, name: true, username: true, role: true, permissions: true, status: true } },
      stores: { orderBy: { id: 'asc' } },
    },
  });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json(shop);
});

// Edit shop details (name, slug, status, logo, signatures) and its Admin +
// Staff accounts. Optional multipart fields `logo`/`signaturePreparedBy`/
// `signatureReviewedBy`/`signatureApprovedBy`; each account's fields are
// only applied when sent, so leaving username/password blank keeps the
// existing values.
router.put('/shops/:id', uploadShopImages, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid shop id' });
  const shop = await prisma.shop.findUnique({ where: { id }, include: { admins: true } });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const {
    code,
    name,
    slug,
    status,
    address,
    phone,
    adminName,
    adminUsername,
    adminPassword,
    adminPermissions,
  } = req.body || {};

  let normalizedCode = shop.code;
  if (code) {
    normalizedCode = String(code).trim().toUpperCase();
    if (!normalizedCode) return res.status(400).json({ error: 'Invalid Shop ID' });
    const existingCode = await prisma.shop.findUnique({ where: { code: normalizedCode } });
    if (existingCode && existingCode.id !== id) {
      return res.status(409).json({ error: 'That Shop ID is already in use' });
    }
  }

  let normalizedSlug = shop.slug;
  if (slug) {
    normalizedSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!normalizedSlug) return res.status(400).json({ error: 'Invalid shop URL slug' });
    const existing = await prisma.shop.findUnique({ where: { slug: normalizedSlug } });
    if (existing && existing.id !== id) {
      return res.status(409).json({ error: 'That shop URL slug is already taken' });
    }
  }

  const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
  const logoFile = files?.logo?.[0];
  const preparedByFile = files?.signaturePreparedBy?.[0];
  const reviewedByFile = files?.signatureReviewedBy?.[0];
  const approvedByFile = files?.signatureApprovedBy?.[0];
  let logoUrl = shop.logoUrl;
  if (logoFile) logoUrl = await uploadLogoBuffer(logoFile.buffer, logoFile.mimetype);
  let preparedBySignatureUrl = shop.preparedBySignatureUrl;
  if (preparedByFile) preparedBySignatureUrl = await uploadSignatureBuffer(preparedByFile.buffer, preparedByFile.mimetype);
  let reviewedBySignatureUrl = shop.reviewedBySignatureUrl;
  if (reviewedByFile) reviewedBySignatureUrl = await uploadSignatureBuffer(reviewedByFile.buffer, reviewedByFile.mimetype);
  let approvedBySignatureUrl = shop.approvedBySignatureUrl;
  if (approvedByFile) approvedBySignatureUrl = await uploadSignatureBuffer(approvedByFile.buffer, approvedByFile.mimetype);

  const updated = await prisma.shop.update({
    where: { id },
    data: {
      code: normalizedCode,
      ...(name ? { name: String(name) } : {}),
      slug: normalizedSlug,
      logoUrl,
      preparedBySignatureUrl,
      reviewedBySignatureUrl,
      approvedBySignatureUrl,
      ...(address !== undefined ? { address: address ? String(address).trim() : null } : {}),
      ...(phone !== undefined ? { phone: phone ? String(phone).trim() : null } : {}),
      ...(status === 'ACTIVE' || status === 'SUSPENDED' ? { status } : {}),
    },
  });

  const adminAccount = shop.admins.find((a) => a.role === 'ADMIN');
  if (adminAccount && (adminName || adminUsername || adminPassword || adminPermissions !== undefined)) {
    await prisma.shopAdmin.update({
      where: { id: adminAccount.id },
      data: {
        ...(adminName ? { name: String(adminName) } : {}),
        ...(adminUsername ? { username: String(adminUsername) } : {}),
        ...(adminPassword ? { passwordHash: await bcrypt.hash(adminPassword, 10) } : {}),
        ...(adminPermissions !== undefined ? { permissions: parsePermissions(adminPermissions) } : {}),
      },
    });
  }

  res.json(updated);
});

// =======================================================
// STAFF ACCOUNTS — a shop can have any number of STAFF logins
// (unlike the single ADMIN account, still managed inline on the
// shop itself). Deactivating rather than deleting one preserves
// its history (Sales, etc. reference the account and aren't
// cascade-deleted) while blocking login, same mechanism as a
// suspended shop.
// =======================================================

router.post('/shops/:id/staff', async (req, res) => {
  const shopId = Number(req.params.id);
  if (!Number.isInteger(shopId)) return res.status(400).json({ error: 'Invalid shop id' });
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const { name, username, password, permissions } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username, and password are required' });
  }

  const clash = await prisma.shopAdmin.findFirst({ where: { shopId, username: String(username) } });
  if (clash) return res.status(409).json({ error: 'That username is already used in this shop' });

  const created = await prisma.shopAdmin.create({
    data: {
      shopId,
      username: String(username),
      passwordHash: await bcrypt.hash(String(password), 10),
      name: String(name),
      role: 'STAFF',
      permissions: parsePermissions(permissions),
    },
    select: { id: true, name: true, username: true, role: true, permissions: true, status: true },
  });
  res.status(201).json(created);
});

router.put('/shops/:id/staff/:staffId', async (req, res) => {
  const shopId = Number(req.params.id);
  const staffId = Number(req.params.staffId);
  if (!Number.isInteger(shopId) || !Number.isInteger(staffId)) return res.status(400).json({ error: 'Invalid id' });
  const staff = await prisma.shopAdmin.findFirst({ where: { id: staffId, shopId, role: 'STAFF' } });
  if (!staff) return res.status(404).json({ error: 'Staff account not found' });

  const { name, username, password, permissions } = req.body || {};
  if (username) {
    const clash = await prisma.shopAdmin.findFirst({ where: { shopId, username: String(username), NOT: { id: staffId } } });
    if (clash) return res.status(409).json({ error: 'That username is already used in this shop' });
  }

  const updated = await prisma.shopAdmin.update({
    where: { id: staffId },
    data: {
      ...(name ? { name: String(name) } : {}),
      ...(username ? { username: String(username) } : {}),
      ...(password ? { passwordHash: await bcrypt.hash(String(password), 10) } : {}),
      ...(permissions !== undefined ? { permissions: parsePermissions(permissions) } : {}),
    },
    select: { id: true, name: true, username: true, role: true, permissions: true, status: true },
  });
  res.json(updated);
});

router.patch('/shops/:id/staff/:staffId/status', async (req, res) => {
  const shopId = Number(req.params.id);
  const staffId = Number(req.params.staffId);
  if (!Number.isInteger(shopId) || !Number.isInteger(staffId)) return res.status(400).json({ error: 'Invalid id' });
  const staff = await prisma.shopAdmin.findFirst({ where: { id: staffId, shopId, role: 'STAFF' } });
  if (!staff) return res.status(404).json({ error: 'Staff account not found' });

  const updated = await prisma.shopAdmin.update({
    where: { id: staffId },
    data: { status: staff.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
    select: { id: true, name: true, username: true, role: true, permissions: true, status: true },
  });
  res.json(updated);
});

// Add a new branch/store under an existing shop — Super Admin only (there is
// no shop-admin-facing route that creates a Store). A new branch needs its
// own InvoiceCounter row, same as the "Main Store" seeded at shop creation.
router.post('/shops/:id/stores', async (req, res) => {
  const shopId = Number(req.params.id);
  if (!Number.isInteger(shopId)) return res.status(400).json({ error: 'Invalid shop id' });
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const { name, address, phone } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Branch name is required' });

  const store = await prisma.$transaction(async (tx) => {
    const branchCount = await tx.store.count({ where: { shopId } });
    const created = await tx.store.create({
      data: {
        shopId,
        name: String(name).trim(),
        code: `BR${String(branchCount + 1).padStart(2, '0')}`,
        address: address ? String(address).trim() : null,
        phone: phone ? String(phone).trim() : null,
      },
    });
    await tx.invoiceCounter.create({ data: { storeId: created.id, value: 0 } });
    return created;
  });

  res.status(201).json(store);
});

// Delete a shop and all of its data. Done manually in dependency order
// because some relations (e.g. SaleItem -> Product/Batch) are RESTRICT and
// would block a naive cascade at the DB level.
router.delete('/shops/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid shop id' });
  const shop = await prisma.shop.findUnique({ where: { id } });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  await prisma.$transaction(
    async (tx) => {
      await tx.saleItem.deleteMany({ where: { sale: { shopId: id } } });
      await tx.sale.deleteMany({ where: { shopId: id } });
      await tx.batch.deleteMany({ where: { product: { shopId: id } } });
      await tx.product.deleteMany({ where: { shopId: id } });
      await tx.customer.deleteMany({ where: { shopId: id } });
      await tx.shopAdmin.deleteMany({ where: { shopId: id } });
      await tx.invoiceCounter.deleteMany({ where: { store: { shopId: id } } });
      await tx.store.deleteMany({ where: { shopId: id } });
      await tx.subDepartment.deleteMany({ where: { department: { shopId: id } } });
      await tx.department.deleteMany({ where: { shopId: id } });
      await tx.supplier.deleteMany({ where: { shopId: id } });
      await tx.shopSetting.deleteMany({ where: { shopId: id } });
      await tx.customerCounter.deleteMany({ where: { shopId: id } });
      await tx.shop.delete({ where: { id } });
    },
    // A fully-cloned shop carries ~17k products — well past Prisma's default
    // 5s interactive-transaction timeout, which fails this delete outright
    // (verified: P2028 "Transaction not found" against a real 17k-product
    // shop). Same timeout already used elsewhere in this file for
    // similarly large multi-step transactions.
    { timeout: 30000, maxWait: 10000 },
  );

  res.json({ ok: true });
});

router.get('/shops/:id/sales-summary', async (req, res) => {
  const shopId = Number(req.params.id);
  const { from, to } = req.query;

  const where: any = { shopId };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(String(to));
  }

  // aggregateCogs needs concrete Date bounds — mirror the aggregate's own
  // (unbounded when neither from nor to is given) window with epoch/now.
  const cogsFrom = from ? new Date(String(from)) : new Date(0);
  const cogsTo = to ? new Date(String(to)) : new Date();

  const [agg, recent, cogs] = await Promise.all([
    prisma.sale.aggregate({ where, _sum: { netAmount: true, dueAmount: true }, _count: true }),
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { customer: true, store: true },
    }),
    aggregateCogs(shopId, undefined, cogsFrom, cogsTo),
  ]);

  const totalSales = agg._sum.netAmount || 0;

  res.json({
    totalSales,
    totalDue: agg._sum.dueAmount || 0,
    totalOrders: agg._count,
    totalProfit: totalSales - cogs,
    recentSales: recent,
  });
});

export default router;
