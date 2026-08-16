import path from 'path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const SHOP_SLUG = process.env.IMPORT_SHOP_SLUG || 'shop';

type SourceRow = {
  'ITEM NO': string;
  'ITEM TYPE NAME': string | null;
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

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'Medicine Data.xlsx');
  console.log(`Reading ${filePath} ...`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: null });
  console.log(`Read ${rows.length} rows`);

  const shop = await prisma.shop.findUnique({ where: { slug: SHOP_SLUG } });
  if (!shop) throw new Error(`Shop with slug "${SHOP_SLUG}" not found`);

  const updates = rows
    .map((row) => {
      const itemNo = (row['ITEM NO'] || '').toString().trim();
      if (!itemNo) return null;
      return {
        externalCode: itemNo,
        dosageForm: row['ITEM TYPE NAME'] ? String(row['ITEM TYPE NAME']).trim() : null,
        lastPurchaseReqDate: parseExcelDate(row['PUR REQ. DATE']),
        lastSoldSnapshot: parseExcelDate(row['INVOICE DATE']),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`Backfilling ${updates.length} products (chunked)...`);
  let updated = 0;
  for (const [i, batch] of chunk(updates, 500).entries()) {
    const values: string[] = [];
    const params: any[] = [];
    let p = 1;
    for (const u of batch) {
      values.push(`($${p}::text, $${p + 1}::text, $${p + 2}::timestamp, $${p + 3}::timestamp)`);
      params.push(u.externalCode, u.dosageForm, u.lastPurchaseReqDate, u.lastSoldSnapshot);
      p += 4;
    }
    const sql = `
      UPDATE "Product" AS p
      SET "dosageForm" = v.dosage_form, "lastPurchaseReqDate" = v.pr_date, "lastSoldSnapshot" = v.inv_date
      FROM (VALUES ${values.join(', ')}) AS v(external_code, dosage_form, pr_date, inv_date)
      WHERE p."shopId" = ${shop.id} AND p."externalCode" = v.external_code
    `;
    const count = await prisma.$executeRawUnsafe(sql, ...params);
    updated += count;
    console.log(`  chunk ${i + 1}/${Math.ceil(updates.length / 500)}: ${count} rows updated (running total ${updated})`);
  }

  console.log(`\n=== Backfill complete: ${updated} products updated ===`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
