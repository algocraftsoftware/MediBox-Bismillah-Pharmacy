-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "dosageForm" TEXT,
ADD COLUMN     "lastPurchaseReqDate" TIMESTAMP(3),
ADD COLUMN     "lastSoldSnapshot" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Product_shopId_dosageForm_idx" ON "Product"("shopId", "dosageForm");
