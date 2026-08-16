-- Add batchNoSnapshot as nullable, backfill from the live Batch table,
-- then enforce NOT NULL (existing SaleItem rows predate this column).
ALTER TABLE "SaleItem" ADD COLUMN "batchNoSnapshot" TEXT;

UPDATE "SaleItem" si
SET "batchNoSnapshot" = b."batchNo"
FROM "Batch" b
WHERE b.id = si."batchId" AND si."batchNoSnapshot" IS NULL;

UPDATE "SaleItem" SET "batchNoSnapshot" = 'N/A' WHERE "batchNoSnapshot" IS NULL;

ALTER TABLE "SaleItem" ALTER COLUMN "batchNoSnapshot" SET NOT NULL;
