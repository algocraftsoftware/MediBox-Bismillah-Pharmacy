import path from 'path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

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
  // Deliberately NOT read into the DB: STOCK QTY., PUR REQ. DATE,
  // INVOICE DATE — those are genuinely shop-specific and must only ever come
  // from real GRN/requisition/sale activity, never from a bulk import. Box
  // Qty IS imported (it's a product attribute shown on stock data).
  // Purchase Price / Sales Price DO get imported, as shared reference/default
  // pricing — editable later via GRN, but not blank until then.
};

// Every product gets one reference "opening" batch per store — carries
// Purchase Price / Sales Price / MRP as the default pricing, but Stock Qty
// is always 0 (no store has physically received this stock yet). Matches
// the placeholder-batch convention the original importMedicineData.ts used.
const REFERENCE_BATCH_EXPIRY_YEARS = 2;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Neon's pooled connection occasionally drops mid-script ("Server has closed
// the connection", Prisma error P1017) during a long run of many small
// sequential queries (the per-category/per-manufacturer upsert loops below).
// Every write here is already idempotent (upsert, or createMany with
// skipDuplicates), so simply retrying the same call is always safe.
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isTransient =
        err?.code === 'P1017' ||
        err?.code === 'P1001' ||
        err?.code === 'P1008' ||
        err?.name === 'PrismaClientInitializationError';
      if (!isTransient || attempt === attempts) throw err;
      const delayMs = attempt * 1000;
      console.log(`  [retry] ${label} failed (${err.code}), attempt ${attempt}/${attempts}, retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('unreachable');
}

function detectControlledClass(category: string): 'NONE' | 'ANTIBIOTIC' | 'SEDATIVE_CNS' {
  const c = category.toUpperCase();
  if (c.includes('ANTIBIOTIC')) return 'ANTIBIOTIC';
  if (c.includes('SEDATIVE') || c.includes('HYPNOTIC') || c.includes('PSYCHOTROPIC') || c.includes(' CNS')) {
    return 'SEDATIVE_CNS';
  }
  return 'NONE';
}

// Same convention as the original importMedicineData.ts / fixDepartments.ts:
// pharma category codes look like "G-01-(01) ORAL ANTIBIOTIC" or "(24)
// FREEZING-INSULIN"; genuine non-pharma retail categories are plain names.
function isPharmaCategory(category: string): boolean {
  return /^G-\d+/i.test(category) || /^\(\d+\)/.test(category);
}

async function wipeCatalogAndTransactions() {
  console.log('=== Wiping existing catalog + all transactional history (every shop) ===');
  const steps: [string, () => Promise<{ count: number }>][] = [
    ['SaleItem', () => prisma.saleItem.deleteMany({})],
    ['Sale', () => prisma.sale.deleteMany({})],
    ['GrnItem', () => prisma.grnItem.deleteMany({})],
    ['Grn (incl. Adjust-With-PO, cascades GrnRtvAdjustment)', () => prisma.grn.deleteMany({})],
    ['AdjOthersItem', () => prisma.adjOthersItem.deleteMany({})],
    ['AdjOthers', () => prisma.adjOthers.deleteMany({})],
    ['RtvItem', () => prisma.rtvItem.deleteMany({})],
    ['Rtv', () => prisma.rtv.deleteMany({})],
    ['VstItem', () => prisma.vstItem.deleteMany({})],
    ['Vst', () => prisma.vst.deleteMany({})],
    ['PurchaseRequisitionItem', () => prisma.purchaseRequisitionItem.deleteMany({})],
    ['PurchaseRequisition', () => prisma.purchaseRequisition.deleteMany({})],
    ['Batch', () => prisma.batch.deleteMany({})],
    ['Product', () => prisma.product.deleteMany({})],
    ['SubDepartment', () => prisma.subDepartment.deleteMany({})],
    ['Department', () => prisma.department.deleteMany({})],
    ['Supplier', () => prisma.supplier.deleteMany({})],
  ];
  for (const [label, run] of steps) {
    const result = await withRetry(run, `delete ${label}`);
    console.log(`  deleted ${result.count} ${label}`);
  }
}

async function importForShop(shopId: number, shopName: string, cleanRows: SourceRow[]) {
  console.log(`\n=== Importing catalog for shop ${shopId} (${shopName}) ===`);

  const pharmaDept = await withRetry(
    () =>
      prisma.department.upsert({
        where: { shopId_name: { shopId, name: 'Pharma' } },
        update: {},
        create: { shopId, name: 'Pharma' },
      }),
    'upsert Pharma department',
  );
  const nonPharmaDept = await withRetry(
    () =>
      prisma.department.upsert({
        where: { shopId_name: { shopId, name: 'Non-Pharma' } },
        update: {},
        create: { shopId, name: 'Non-Pharma' },
      }),
    'upsert Non-Pharma department',
  );

  const categoryNames = Array.from(
    new Set(cleanRows.map((r) => (r['CATEGORY NAME'] || 'UNCATEGORIZED').toString().trim())),
  );
  const manufacturerNames = Array.from(
    new Set(cleanRows.map((r) => (r['MANUFACTURER NAME'] || '').toString().trim()).filter(Boolean)),
  );

  console.log(`  upserting ${categoryNames.length} sub-departments...`);
  const subDeptIdByName = new Map<string, number>();
  for (const name of categoryNames) {
    const departmentId = isPharmaCategory(name) ? pharmaDept.id : nonPharmaDept.id;
    const sub = await withRetry(
      () =>
        prisma.subDepartment.upsert({
          where: { departmentId_name: { departmentId, name } },
          update: {},
          create: { departmentId, name },
        }),
      `upsert sub-department "${name}"`,
    );
    subDeptIdByName.set(name, sub.id);
  }

  console.log(`  upserting ${manufacturerNames.length} suppliers...`);
  const supplierIdByName = new Map<string, number>();
  for (const name of manufacturerNames) {
    const supplier = await withRetry(
      () =>
        prisma.supplier.upsert({
          where: { shopId_name: { shopId, name } },
          update: {},
          create: { shopId, name },
        }),
      `upsert supplier "${name}"`,
    );
    supplierIdByName.set(name, supplier.id);
  }

  console.log('  inserting products (chunked)...');
  const productChunks = chunk(cleanRows, 1000);
  let productsInserted = 0;
  for (const [i, batchRows] of productChunks.entries()) {
    const data = batchRows.map((row) => {
      const category = (row['CATEGORY NAME'] || 'UNCATEGORIZED').toString().trim();
      return {
        shopId,
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
        reorderLevel: Number(row['RE-ORDER LEVEL']) || 0,
        boxQty: Number(row['BOX QTY.']) || 1,
        dosageForm: row['ITEM TYPE NAME'] ? String(row['ITEM TYPE NAME']).trim() : null,
        // lastPurchaseReqDate / lastSoldSnapshot intentionally omitted — the
        // two dates must start blank and only ever be set by real, live app
        // activity.
      };
    });
    const result = await withRetry(
      () => prisma.product.createMany({ data, skipDuplicates: true }),
      `insert product chunk ${i + 1}`,
    );
    productsInserted += result.count;
    console.log(`    chunk ${i + 1}/${productChunks.length}: +${result.count} (running total ${productsInserted})`);
  }

  return productsInserted;
}

async function importReferenceBatches(shopId: number, storeIds: number[], cleanRows: SourceRow[]) {
  if (storeIds.length === 0) return 0;

  const products = await withRetry(
    () =>
      prisma.product.findMany({
        where: { shopId, externalCode: { not: null } },
        select: { id: true, externalCode: true },
      }),
    'load product id map',
  );
  const productIdByExternalCode = new Map(products.map((p) => [p.externalCode as string, p.id]));

  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + REFERENCE_BATCH_EXPIRY_YEARS);

  let batchesInserted = 0;
  for (const storeId of storeIds) {
    const batchChunks = chunk(cleanRows, 1000);
    for (const [i, batchRows] of batchChunks.entries()) {
      const data = batchRows
        .map((row) => {
          const itemNo = (row['ITEM NO'] || '').toString().trim();
          const productId = productIdByExternalCode.get(itemNo);
          if (!productId) return null;
          const sellingPrice = Number(row['SALES PRICE']) || 0;
          return {
            productId,
            storeId,
            batchNo: `OPEN-${itemNo}`,
            barcode: itemNo,
            expiryDate,
            mrp: sellingPrice,
            purchasePrice: Number(row['PURCHASE PRICE']) || 0,
            sellingPrice,
            vatPct: 0,
            discPct: 0,
            // Reference pricing only — never real opening stock.
            stockQty: 0,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const result = await withRetry(
        () => prisma.batch.createMany({ data, skipDuplicates: true }),
        `insert batch chunk (store ${storeId}) ${i + 1}`,
      );
      batchesInserted += result.count;
      console.log(
        `    store ${storeId} chunk ${i + 1}/${batchChunks.length}: +${result.count} reference batches (running total ${batchesInserted})`,
      );
    }
  }

  return batchesInserted;
}

async function main() {
  const filePath = path.join(__dirname, '..', 'assets', 'TOTAL STK DATA.xlsx');
  console.log(`Reading ${filePath} ...`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: null });
  console.log(`Read ${rows.length} rows from "${workbook.SheetNames[0]}"`);

  const byItemNo = new Map<string, SourceRow>();
  let skipped = 0;
  for (const row of rows) {
    const itemNo = (row['ITEM NO'] || '').toString().trim();
    if (!itemNo) {
      skipped += 1;
      continue;
    }
    byItemNo.set(itemNo, row);
  }
  const cleanRows = Array.from(byItemNo.values());
  console.log(`${cleanRows.length} unique items by ITEM NO (${skipped} rows skipped: missing ITEM NO)`);

  const shops = await prisma.shop.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
  console.log(`Found ${shops.length} shop(s):`, shops.map((s) => `${s.id}:${s.name}`).join(', '));

  const storesByShop = new Map<number, number[]>();
  for (const shop of shops) {
    const stores = await prisma.store.findMany({ where: { shopId: shop.id }, select: { id: true } });
    storesByShop.set(shop.id, stores.map((s) => s.id));
  }

  await wipeCatalogAndTransactions();

  const results: { shopId: number; name: string; productsInserted: number; batchesInserted: number }[] = [];
  for (const shop of shops) {
    const productsInserted = await importForShop(shop.id, shop.name, cleanRows);
    const storeIds = storesByShop.get(shop.id) || [];
    console.log(`  seeding reference batches for ${storeIds.length} store(s)...`);
    const batchesInserted = await importReferenceBatches(shop.id, storeIds, cleanRows);
    results.push({ shopId: shop.id, name: shop.name, productsInserted, batchesInserted });
  }

  console.log('\n=== Reset + reimport complete ===');
  for (const r of results) {
    console.log(`  shop ${r.shopId} (${r.name}): ${r.productsInserted} products, ${r.batchesInserted} reference batches (all Stock Qty = 0)`);
  }
}

main()
  .catch((e) => {
    console.error('Reset/reimport failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
