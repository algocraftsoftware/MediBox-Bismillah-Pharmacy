import path from 'path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

type SourceRow = {
  'ITEM NO': string;
  'BOX QTY.': number | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const filePath = path.join(__dirname, '..', 'assets', 'TOTAL STK DATA.xlsx');
  console.log(`Reading ${filePath} ...`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: null });
  console.log(`Read ${rows.length} rows from "${workbook.SheetNames[0]}"`);

  const updates = rows
    .map((row) => {
      const itemNo = (row['ITEM NO'] || '').toString().trim();
      if (!itemNo) return null;
      return {
        externalCode: itemNo,
        boxQty: Number(row['BOX QTY.']) || 1,
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
      values.push(`($${p}::text, $${p + 1}::int)`);
      params.push(u.externalCode, u.boxQty);
      p += 2;
    }
    const sql = `
      UPDATE "Product" AS p
      SET "boxQty" = v.box_qty
      FROM (VALUES ${values.join(', ')}) AS v(external_code, box_qty)
      WHERE p."externalCode" = v.external_code
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
