import path from 'path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const SHOP_SLUG = process.env.IMPORT_SHOP_SLUG || 'shop';
const STORE_CODE = process.env.IMPORT_STORE_CODE || 'KALSHI01';
// The source sheet has no batch/expiry data at all — every row becomes a
// single "opening stock" batch with a placeholder expiry far in the future.
// Real expiry dates arrive with the GRN module later.
const PLACEHOLDER_EXPIRY_YEARS = 2;

type SourceRow = {
  'ITEM NO': string;
  'ITEM NAME': string;
  'ITEM TYPE NAME': string | null;
  'UOM': string | null;
  'GENERIC NAME': string | null;
  'MANUFACTURER NAME': string | null;
  'CATEGORY NAME': string | null;
  'PURCHASE PRICE': number | null;
  'SALES PRICE': number | null;
  'BOX QTY.': number | null;
  'RE-ORDER LEVEL': number | null;
  'STOCK QTY.': number | null;
  'PUR REQ. DATE': string | number | null;
  'INVOICE DATE': string | number | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// The sheet stores dates as Excel serial numbers in some rows and strings in
// others — normalize both to a JS Date or null.
function parseExcelDate(value: string | number | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function detectControlledClass(category: string): 'NONE' | 'ANTIBIOTIC' | 'SEDATIVE_CNS' {
  const c = category.toUpperCase();
  if (c.includes('ANTIBIOTIC')) return 'ANTIBIOTIC';
  if (c.includes('SEDATIVE') || c.includes('HYPNOTIC') || c.includes('PSYCHOTROPIC') || c.includes(' CNS')) {
    return 'SEDATIVE_CNS';
  }
  return 'NONE';
}

// The source sheet has no explicit Pharma/Non-Pharma column — but every
// medicine category name in it is coded like "G-01-(01) ORAL ANTIBIOTIC" or
// "(24) FREEZING-INSULIN", while genuine retail categories are plain names
// like "GENERAL TOILETRIES" or "TOYS". Use that coding as the department
// split (see scripts/fixDepartments.ts for the one-off backfill this mirrors).
function isPharmaCategory(category: string): boolean {
  return /^G-\d+/i.test(category) || /^\(\d+\)/.test(category);
}

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'Medicine Data.xlsx');
  console.log(`Reading ${filePath} ...`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: null });
  console.log(`Read ${rows.length} rows from "${workbook.SheetNames[0]}"`);

  const shop = await prisma.shop.findUnique({ where: { slug: SHOP_SLUG } });
  if (!shop) throw new Error(`Shop with slug "${SHOP_SLUG}" not found — run the account seed first.`);

  const store = await prisma.store.findUnique({ where: { shopId_code: { shopId: shop.id, code: STORE_CODE } } });
  if (!store) throw new Error(`Store with code "${STORE_CODE}" not found in shop "${SHOP_SLUG}".`);

  const pharmaDept = await prisma.department.upsert({
    where: { shopId_name: { shopId: shop.id, name: 'Pharma' } },
    update: {},
    create: { shopId: shop.id, name: 'Pharma' },
  });
  const nonPharmaDept = await prisma.department.upsert({
    where: { shopId_name: { shopId: shop.id, name: 'Non-Pharma' } },
    update: {},
    create: { shopId: shop.id, name: 'Non-Pharma' },
  });

  // Clean + de-duplicate by ITEM NO (last occurrence wins if the sheet has dupes)
  const byItemNo = new Map<string, SourceRow>();
  let skippedNoItemNo = 0;
  for (const row of rows) {
    const itemNo = (row['ITEM NO'] || '').toString().trim();
    if (!itemNo) {
      skippedNoItemNo += 1;
      continue;
    }
    byItemNo.set(itemNo, row);
  }
  const cleanRows = Array.from(byItemNo.values());
  console.log(`${cleanRows.length} unique items by ITEM NO (${skippedNoItemNo} rows skipped: missing ITEM NO)`);

  const categoryNames = Array.from(
    new Set(cleanRows.map((r) => (r['CATEGORY NAME'] || 'UNCATEGORIZED').toString().trim()))
  );
  const manufacturerNames = Array.from(
    new Set(cleanRows.map((r) => (r['MANUFACTURER NAME'] || '').toString().trim()).filter(Boolean))
  );

  console.log(`Upserting ${categoryNames.length} sub-departments (categories)...`);
  const subDeptIdByName = new Map<string, number>();
  for (const name of categoryNames) {
    const departmentId = isPharmaCategory(name) ? pharmaDept.id : nonPharmaDept.id;
    const sub = await prisma.subDepartment.upsert({
      where: { departmentId_name: { departmentId, name } },
      update: {},
      create: { departmentId, name },
    });
    subDeptIdByName.set(name, sub.id);
  }

  console.log(`Upserting ${manufacturerNames.length} suppliers (manufacturers)...`);
  const supplierIdByName = new Map<string, number>();
  for (const name of manufacturerNames) {
    const supplier = await prisma.supplier.upsert({
      where: { shopId_name: { shopId: shop.id, name } },
      update: {},
      create: { shopId: shop.id, name },
    });
    supplierIdByName.set(name, supplier.id);
  }

  console.log('Inserting products (chunked)...');
  const productChunks = chunk(cleanRows, 1000);
  let productsInserted = 0;
  for (const [i, batchRows] of productChunks.entries()) {
    const data = batchRows.map((row) => {
      const category = (row['CATEGORY NAME'] || 'UNCATEGORIZED').toString().trim();
      return {
        shopId: shop.id,
        externalCode: (row['ITEM NO'] || '').toString().trim(),
        name: (row['ITEM NAME'] || '').toString().trim() || 'Unnamed Item',
        genericName: (row['GENERIC NAME'] || '').toString().trim(),
        departmentId: isPharmaCategory(category) ? pharmaDept.id : nonPharmaDept.id,
        subDepartmentId: subDeptIdByName.get(category) || null,
        defaultSupplierId: row['MANUFACTURER NAME']
          ? supplierIdByName.get(row['MANUFACTURER NAME'].toString().trim()) || null
          : null,
        displayCategory: category,
        unit: (row['UOM'] || 'Pcs').toString().trim() || 'Pcs',
        isPrescriptionRequired: detectControlledClass(category) !== 'NONE',
        controlledClass: detectControlledClass(category),
        boxQty: Number(row['BOX QTY.']) || 1,
        reorderLevel: Number(row['RE-ORDER LEVEL']) || 0,
        dosageForm: row['ITEM TYPE NAME'] ? String(row['ITEM TYPE NAME']).trim() : null,
        lastPurchaseReqDate: parseExcelDate(row['PUR REQ. DATE']),
        lastSoldSnapshot: parseExcelDate(row['INVOICE DATE']),
      };
    });
    const result = await prisma.product.createMany({ data, skipDuplicates: true });
    productsInserted += result.count;
    console.log(`  chunk ${i + 1}/${productChunks.length}: +${result.count} products (running total ${productsInserted})`);
  }

  console.log('Loading product id map...');
  const allProducts = await prisma.product.findMany({
    where: { shopId: shop.id, externalCode: { not: null } },
    select: { id: true, externalCode: true },
  });
  const productIdByExternalCode = new Map(allProducts.map((p) => [p.externalCode as string, p.id]));

  console.log('Inserting opening-stock batches (chunked)...');
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + PLACEHOLDER_EXPIRY_YEARS);

  const batchChunks = chunk(cleanRows, 1000);
  let batchesInserted = 0;
  for (const [i, batchRows] of batchChunks.entries()) {
    const data = batchRows
      .map((row) => {
        const itemNo = (row['ITEM NO'] || '').toString().trim();
        const productId = productIdByExternalCode.get(itemNo);
        if (!productId) return null;
        const sellingPrice = Number(row['SALES PRICE']) || 0;
        return {
          productId,
          storeId: store.id,
          batchNo: `OPEN-${itemNo}`,
          barcode: itemNo,
          expiryDate,
          mrp: sellingPrice,
          purchasePrice: Number(row['PURCHASE PRICE']) || 0,
          sellingPrice,
          vatPct: 0,
          discPct: 0,
          stockQty: Number(row['STOCK QTY.']) || 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const result = await prisma.batch.createMany({ data, skipDuplicates: true });
    batchesInserted += result.count;
    console.log(`  chunk ${i + 1}/${batchChunks.length}: +${result.count} batches (running total ${batchesInserted})`);
  }

  console.log('\n=== Import complete ===');
  console.log(`Products inserted (new): ${productsInserted}`);
  console.log(`Batches inserted (new): ${batchesInserted}`);
  console.log(`Store: ${store.name} (${store.code})`);
  console.log(
    `NOTE: source data had no batch numbers or expiry dates, so every item got one synthetic "OPEN-" batch with a placeholder expiry ${PLACEHOLDER_EXPIRY_YEARS} years out. Replace with real batch/expiry data via GRN once that module exists.`
  );
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
