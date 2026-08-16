-- DropIndex
DROP INDEX "Customer_shopId_mobile_key";

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "isPrdm" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Customer_shopId_mobile_idx" ON "Customer"("shopId", "mobile");

