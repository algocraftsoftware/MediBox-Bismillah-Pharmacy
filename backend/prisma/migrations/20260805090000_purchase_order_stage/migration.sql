-- Purchase Order stage: extend PurchaseRequisition with order-level fields
-- and a FINAL_APPROVED status.

ALTER TYPE "RequisitionStatus" ADD VALUE IF NOT EXISTS 'FINAL_APPROVED';

CREATE TABLE IF NOT EXISTS "OrderCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("shopId")
);

ALTER TABLE "PurchaseRequisition" ADD COLUMN IF NOT EXISTS "orderNo" TEXT;
ALTER TABLE "PurchaseRequisition" ADD COLUMN IF NOT EXISTS "deliverToStoreId" INTEGER;
ALTER TABLE "PurchaseRequisition" ADD COLUMN IF NOT EXISTS "paymentMode" TEXT;
ALTER TABLE "PurchaseRequisition" ADD COLUMN IF NOT EXISTS "expectedDate" TIMESTAMP(3);
ALTER TABLE "PurchaseRequisition" ADD COLUMN IF NOT EXISTS "finalApprovedById" INTEGER;
ALTER TABLE "PurchaseRequisition" ADD COLUMN IF NOT EXISTS "finalApprovedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseRequisition_shopId_orderNo_key" ON "PurchaseRequisition"("shopId", "orderNo");

ALTER TABLE "PurchaseRequisition" DROP CONSTRAINT IF EXISTS "PurchaseRequisition_deliverToStoreId_fkey";
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_deliverToStoreId_fkey"
    FOREIGN KEY ("deliverToStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseRequisition" DROP CONSTRAINT IF EXISTS "PurchaseRequisition_finalApprovedById_fkey";
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_finalApprovedById_fkey"
    FOREIGN KEY ("finalApprovedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
