import { parse } from 'csv-parse/sync';
import { Router } from 'express';
import { prisma } from '../db';
import { requireShopAdmin } from '../auth';
import { uploadCsv } from '../uploads';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// CSV IMPORT (product master + opening stock, standing in for GRN)
// =======================================================

router.post('/products/import', uploadCsv.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required (field name "file")' });
  const shopId = req.shop!.id;
  const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as any[];

  let created = 0;
  for (const row of records) {
    const department = await prisma.department.upsert({
      where: { shopId_name: { shopId, name: row.department } },
      update: {},
      create: { shopId, name: row.department },
    });
    let subDepartmentId: number | undefined;
    if (row.subDepartment) {
      const subDept = await prisma.subDepartment.upsert({
        where: { departmentId_name: { departmentId: department.id, name: row.subDepartment } },
        update: {},
        create: { departmentId: department.id, name: row.subDepartment },
      });
      subDepartmentId = subDept.id;
    }
    let defaultSupplierId: number | undefined;
    if (row.supplier) {
      const supplier = await prisma.supplier.upsert({
        where: { shopId_name: { shopId, name: row.supplier } },
        update: {},
        create: { shopId, name: row.supplier },
      });
      defaultSupplierId = supplier.id;
    }

    await prisma.product.create({
      data: {
        shopId,
        name: row.name,
        genericName: row.genericName || '',
        departmentId: department.id,
        subDepartmentId,
        defaultSupplierId,
        unit: row.unit || 'Pcs',
        displayCategory: row.displayCategory || null,
        isPrescriptionRequired: String(row.isPrescriptionRequired).toLowerCase() === 'true',
        controlledClass: (row.controlledClass || 'NONE') as any,
      },
    });
    created += 1;
  }

  res.status(201).json({ imported: created });
});

router.post('/batches/import', uploadCsv.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required (field name "file")' });
  const shopId = req.shop!.id;
  const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as any[];

  let created = 0;
  const errors: string[] = [];
  for (const row of records) {
    const store = await prisma.store.findUnique({ where: { shopId_code: { shopId, code: row.storeCode } } });
    const product = await prisma.product.findFirst({
      where: { shopId, name: row.productName, genericName: row.genericName || '' },
    });
    if (!store || !product) {
      errors.push(`Skipped batch ${row.batchNo}: store or product not found`);
      continue;
    }

    await prisma.batch.create({
      data: {
        productId: product.id,
        storeId: store.id,
        batchNo: row.batchNo,
        barcode: row.barcode || null,
        expiryDate: new Date(row.expiryDate),
        mrp: Number(row.mrp),
        purchasePrice: Number(row.purchasePrice),
        sellingPrice: Number(row.sellingPrice),
        vatPct: Number(row.vatPct) || 0,
        discPct: Number(row.discPct) || 0,
        stockQty: Number(row.stockQty) || 0,
      },
    });
    created += 1;
  }

  res.status(201).json({ imported: created, errors });
});

export default router;
