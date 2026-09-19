import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off backfill: the original import (see importMedicineData.ts) put every
// product under a single "Pharma" department regardless of its category. This
// reclassifies products whose CATEGORY NAME (stored as displayCategory) isn't
// coded like a medicine category ("G-01-(01) ORAL ANTIBIOTIC", "(24)
// FREEZING-INSULIN") into "Non-Pharma", moving their sub-department along
// with them so SubDepartment.departmentId stays consistent.
function isPharmaCategory(category: string): boolean {
  return /^G-\d+/i.test(category) || /^\(\d+\)/.test(category);
}

async function main() {
  const shopSlug = process.env.IMPORT_SHOP_SLUG || 'shop';
  const shop = await prisma.shop.findUnique({ where: { slug: shopSlug } });
  if (!shop) throw new Error(`Shop with slug "${shopSlug}" not found.`);

  const pharmaDept = await prisma.department.findUnique({
    where: { shopId_name: { shopId: shop.id, name: 'Pharma' } },
  });
  if (!pharmaDept) throw new Error('Pharma department not found for this shop.');

  const nonPharmaDept = await prisma.department.upsert({
    where: { shopId_name: { shopId: shop.id, name: 'Non-Pharma' } },
    update: {},
    create: { shopId: shop.id, name: 'Non-Pharma' },
  });

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, departmentId: pharmaDept.id },
    select: { id: true, displayCategory: true },
  });
  console.log(`Scanning ${products.length} products currently under Pharma...`);

  const nonPharmaCategories = Array.from(
    new Set(products.map((p) => p.displayCategory).filter((c): c is string => !!c && !isPharmaCategory(c)))
  );
  console.log(`${nonPharmaCategories.length} categories reclassified as Non-Pharma:`);
  console.log(nonPharmaCategories.join(', '));

  console.log('Moving sub-departments to Non-Pharma...');
  const subDeptIdByCategory = new Map<string, number>();
  for (const name of nonPharmaCategories) {
    const existing = await prisma.subDepartment.findUnique({
      where: { departmentId_name: { departmentId: pharmaDept.id, name } },
    });
    const moved = await prisma.subDepartment.upsert({
      where: { departmentId_name: { departmentId: nonPharmaDept.id, name } },
      update: {},
      create: { departmentId: nonPharmaDept.id, name },
    });
    subDeptIdByCategory.set(name, moved.id);
    if (existing) {
      // Repoint any product still referencing the old Pharma-owned sub-department
      // row, then remove the now-orphaned row.
      await prisma.product.updateMany({
        where: { subDepartmentId: existing.id },
        data: { subDepartmentId: moved.id },
      });
      await prisma.subDepartment.delete({ where: { id: existing.id } });
    }
  }

  console.log('Reassigning products to Non-Pharma...');
  let updated = 0;
  for (const category of nonPharmaCategories) {
    const subDepartmentId = subDeptIdByCategory.get(category) ?? null;
    const result = await prisma.product.updateMany({
      where: { shopId: shop.id, departmentId: pharmaDept.id, displayCategory: category },
      data: { departmentId: nonPharmaDept.id, subDepartmentId },
    });
    updated += result.count;
  }
  console.log(`Reassigned ${updated} products to Non-Pharma.`);

  const counts = await prisma.product.groupBy({
    by: ['departmentId'],
    where: { shopId: shop.id },
    _count: { _all: true },
  });
  for (const c of counts) {
    const dept = c.departmentId === pharmaDept.id ? 'Pharma' : c.departmentId === nonPharmaDept.id ? 'Non-Pharma' : `dept#${c.departmentId}`;
    console.log(`${dept}: ${c._count._all} products`);
  }
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
