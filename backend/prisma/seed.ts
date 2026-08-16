import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Keep in sync with frontend/src/lib/menuFeatures.ts's ALL_FEATURE_IDS.
const ALL_FEATURES = [
  'adj-with-others', 'adj-with-po', 'billing', 'customer-registration', 'expire-products',
  'grn-with-po', 'grn-without-po', 'internal-issue', 'internal-receive', 'internal-requisition',
  'invoice-item-cancel', 'invoice-list', 'dashboard', 'purchase-requisition', 'purchase-order',
  'req-central-warehouse', 'return-to-vendor', 'sales-report', 'sold-product-ledger',
  'stock-data', 'virtual-stock-transfer', 'employees', 'employee-salary',
];

// Accounts + shop + store scaffolding only. Product/batch data comes from the
// real Medicine Data import (see scripts/importMedicineData.ts), not synthetic seeds.
async function main() {
  console.log('Seeding MediBox accounts...');

  const superAdminPasswordHash = await bcrypt.hash('12345', 10);
  await prisma.superAdmin.upsert({
    where: { email: 's@gmail.com' },
    update: { passwordHash: superAdminPasswordHash },
    create: { name: 'MediBox Platform Owner', email: 's@gmail.com', passwordHash: superAdminPasswordHash },
  });

  // Rename any legacy "demo" slug (from earlier versions) to "shop" so the
  // shop always lives at /shop/login. Depends on nothing else — foreign keys
  // reference the shop id, so the rename is safe on live data.
  const legacy = await prisma.shop.findUnique({ where: { slug: 'demo' } });
  if (legacy) {
    await prisma.shop.update({ where: { slug: 'demo' }, data: { slug: 'shop' } });
    console.log('Renamed legacy shop slug "demo" -> "shop".');
  }

  const shop = await prisma.shop.upsert({
    where: { slug: 'shop' },
    update: {},
    create: { code: 'ASTER001', name: 'Aster Pharmacy Bangladesh', slug: 'shop' },
  });

  await prisma.shopSetting.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id, vatRate: 0, rewardEarnRatePct: 1 },
  });

  await prisma.customerCounter.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id, value: 0 },
  });

  const shariarPasswordHash = await bcrypt.hash('Admin@123', 10);
  await prisma.shopAdmin.upsert({
    where: { shopId_username: { shopId: shop.id, username: 'shariar' } },
    update: { role: 'ADMIN', permissions: ALL_FEATURES },
    create: {
      shopId: shop.id,
      username: 'shariar',
      name: 'SHARIAR HAQUE',
      passwordHash: shariarPasswordHash,
      role: 'ADMIN',
      permissions: ALL_FEATURES,
    },
  });

  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  await prisma.shopAdmin.upsert({
    where: { shopId_username: { shopId: shop.id, username: 'admin' } },
    update: { passwordHash: adminPasswordHash, role: 'ADMIN', permissions: ALL_FEATURES },
    create: {
      shopId: shop.id,
      username: 'admin',
      name: 'Shop Admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      permissions: ALL_FEATURES,
    },
  });

  const storeDefs = [
    { name: 'KALSHI PHARMACY (MIRPUR)', code: 'KALSHI01', address: 'Kalshi, Mirpur, Dhaka' },
    { name: 'DHANMONDI BRANCH #1', code: 'DHAN01', address: 'Road-27, Dhanmondi, Dhaka' },
    { name: 'GULSHAN MAIN PHARMA', code: 'GULSHAN01', address: 'Gulshan-2, Dhaka' },
  ];
  for (const s of storeDefs) {
    const store = await prisma.store.upsert({
      where: { shopId_code: { shopId: shop.id, code: s.code } },
      update: {},
      create: { shopId: shop.id, name: s.name, code: s.code, address: s.address },
    });
    await prisma.invoiceCounter.upsert({
      where: { storeId: store.id },
      update: {},
      create: { storeId: store.id, value: 0 },
    });
  }

  console.log('Seed complete: 1 shop ("shop"), 3 stores, accounts ready.');
  console.log('Super Admin login (/superadmin/login): s@gmail.com / 12345');
  console.log('Shop Admin login (/shop/login): admin / admin123 (or shariar / Admin@123)');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
