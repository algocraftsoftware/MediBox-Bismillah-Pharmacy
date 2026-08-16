-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "boxQty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "externalCode" TEXT,
ADD COLUMN     "reorderLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopId_externalCode_key" ON "Product"("shopId", "externalCode");
