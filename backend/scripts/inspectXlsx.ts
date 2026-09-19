import path from 'path';
import * as XLSX from 'xlsx';

const filePath = path.join(__dirname, '..', 'data', 'Medicine Data.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('Sheet names:', workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`\n=== Sheet "${sheetName}" — ${rows.length} rows ===`);
  if (rows.length > 0) {
    console.log('Columns:', Object.keys(rows[0] as object));
    console.log('First 3 rows:', JSON.stringify(rows.slice(0, 3), null, 2));
  }
}
