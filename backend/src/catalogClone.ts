import { prisma } from './db';

// Every new shop starts with the full medicine catalog already loaded —
// cloned from whichever existing shop currently has the most products (the
// "template"), rather than re-parsing the source spreadsheet (which isn't
// even present in production — backend/data/ is gitignored and never
// deployed).
//
// Only catalog IDENTITY plus reference pricing is cloned — Item No, Item
// Name, Generic, Display Category, Department, Manufacturer (Supplier),
// Box Qty, and a starting Purchase Price / Sales Price — because that's
// shared reference data, the same medicine (and its default price) everywhere.
// Genuinely shop-specific fields are left out of the copy so each shop starts
// blank and fills them in from its own real operations: Last Req. Date and
// Last Sold Date reset to NULL instead of inheriting the template shop's
// values, and every cloned Batch's Stock Qty is forced to 0 regardless of the
// template's — a brand-new shop hasn't physically received any stock yet, so
// a non-zero opening quantity would be fabricated data, even though the
// reference Purchase/Sales Price it's stamped with is legitimate shared
// catalog data.
//
// The copy runs as a handful of single INSERT ... SELECT statements so the
// whole ~17k-row clone executes server-side in the database in a second or
// two, instead of round-tripping tens of thousands of rows through Node in
// chunks. Because it's so fast, the enrollment route can fire it off after
// responding (non-blocking) and it still lands before a serverless function
// freezes.
export async function cloneMedicineCatalog(newShopId: number, newStoreId: number) {
  const grouped = await prisma.product.groupBy({
    by: ['shopId'],
    where: { shopId: { not: newShopId } },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 1,
  });
  const templateShopId = grouped[0]?.shopId;
  if (!templateShopId) {
    return { productsCloned: 0, batchesCloned: 0, templateShopId: null };
  }

  // Departments — plain copy (a fresh shop can't collide with its own name).
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Department" ("shopId", "name")
     SELECT $1, name FROM "Department" WHERE "shopId" = $2
     ON CONFLICT ("shopId", "name") DO NOTHING`,
    newShopId,
    templateShopId,
  );

  // Sub-departments, re-pointing departmentId at the fresh copies.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SubDepartment" ("departmentId", "name")
     SELECT nd.id, sd.name
     FROM "SubDepartment" sd
     JOIN "Department" od ON od.id = sd."departmentId" AND od."shopId" = $2
     JOIN "Department" nd ON nd."shopId" = $1 AND nd.name = od.name
     ON CONFLICT ("departmentId", "name") DO NOTHING`,
    newShopId,
    templateShopId,
  );

  // Suppliers — plain copy.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Supplier" ("shopId", "name", "contact", "address")
     SELECT $1, name, contact, address FROM "Supplier" WHERE "shopId" = $2
     ON CONFLICT ("shopId", "name") DO NOTHING`,
    newShopId,
    templateShopId,
  );

// Products — only rows with an externalCode (the stable identity key);
// every FK is re-pointed to the fresh department/sub-department/supplier
// copies by matching on name. Box Qty IS copied — it's a shared catalog
// attribute (from the source stock sheet), not a shop's own operational
// figure, so the fresh shop gets the real value instead of the Product
// default (1). lastPurchaseReqDate and lastSoldSnapshot are deliberately
// NOT in this column list — leaving them out of both the target columns and
// the SELECT lets Postgres fall back to NULL, instead of inheriting the
// template shop's shop-specific dates.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Product" (
       "shopId", "name", "genericName", "departmentId", "subDepartmentId",
       "defaultSupplierId", "displayCategory", "unit", "isPrescriptionRequired",
       "controlledClass", "externalCode", "reorderLevel", "dosageForm", "boxQty"
     )
     SELECT
       $1, p.name, p."genericName",
       nd.id,
       nsd.id,
       nsup.id,
       p."displayCategory", p.unit, p."isPrescriptionRequired",
       p."controlledClass", p."externalCode", p."reorderLevel", p."dosageForm", p."boxQty"
     FROM "Product" p
     JOIN "Department" od ON od.id = p."departmentId" AND od."shopId" = $2
     JOIN "Department" nd ON nd."shopId" = $1 AND nd.name = od.name
     LEFT JOIN "SubDepartment" osd ON osd.id = p."subDepartmentId"
     LEFT JOIN "SubDepartment" nsd ON nsd."departmentId" = nd.id AND nsd.name = osd.name
     LEFT JOIN "Supplier" osup ON osup.id = p."defaultSupplierId"
     LEFT JOIN "Supplier" nsup ON nsup."shopId" = $1 AND nsup.name = osup.name
     WHERE p."shopId" = $2 AND p."externalCode" IS NOT NULL
     ON CONFLICT ("shopId", "externalCode") DO NOTHING`,
    newShopId,
    templateShopId,
  );

  // Reference batch per product, into the new shop's initial store — carries
  // over Purchase Price / Sales Price / MRP / batch identity as shared
  // default pricing, but Stock Qty is hard-coded to 0 (not copied from the
  // template) since this new store hasn't physically received anything yet.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Batch" (
       "productId", "storeId", "batchNo", "barcode", "expiryDate", "mrp",
       "purchasePrice", "sellingPrice", "vatPct", "discPct", "stockQty"
     )
     SELECT np.id, $3, b."batchNo", b."barcode", b."expiryDate", b."mrp",
       b."purchasePrice", b."sellingPrice", b."vatPct", b."discPct", 0
     FROM "Batch" b
     JOIN "Product" tp ON tp.id = b."productId" AND tp."shopId" = $2 AND tp."externalCode" IS NOT NULL
     JOIN "Product" np ON np."shopId" = $1 AND np."externalCode" = tp."externalCode"
     ON CONFLICT ("productId", "storeId", "batchNo") DO NOTHING`,
    newShopId,
    templateShopId,
    newStoreId,
  );

  const [productCount, batchCount] = await Promise.all([
    prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT COUNT(*)::int AS c FROM "Product" WHERE "shopId" = $1`,
      newShopId,
    ),
    prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT COUNT(*)::int AS c FROM "Batch" b JOIN "Product" p ON p.id = b."productId" WHERE p."shopId" = $1`,
      newShopId,
    ),
  ]);

  return {
    productsCloned: productCount[0]?.c || 0,
    batchesCloned: batchCount[0]?.c || 0,
    templateShopId,
  };
}
