-- CreateEnum
CREATE TYPE "VstStatus" AS ENUM ('UNAPPROVED', 'APPROVED');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "canceledQty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SaleItemCancellation" (
    "id" SERIAL NOT NULL,
    "saleItemId" INTEGER NOT NULL,
    "saleId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "grossAmt" DOUBLE PRECISION NOT NULL,
    "vatAmt" DOUBLE PRECISION NOT NULL,
    "discAmt" DOUBLE PRECISION NOT NULL,
    "netAmt" DOUBLE PRECISION NOT NULL,
    "refundAmt" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "canceledById" INTEGER NOT NULL,
    "canceledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItemCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VstCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VstCounter_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "Vst" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "vstNo" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "VstStatus" NOT NULL DEFAULT 'UNAPPROVED',
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vst_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VstItem" (
    "id" SERIAL NOT NULL,
    "vstId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "packSize" INTEGER NOT NULL,
    "ppPerPiece" DOUBLE PRECISION NOT NULL,
    "mrpPerPiece" DOUBLE PRECISION NOT NULL,
    "existingQoh" INTEGER NOT NULL,
    "vstQtyPieces" INTEGER NOT NULL,
    "totalPpValue" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "VstItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleItemCancellation_saleId_idx" ON "SaleItemCancellation"("saleId");

-- CreateIndex
CREATE INDEX "SaleItemCancellation_saleItemId_idx" ON "SaleItemCancellation"("saleItemId");

-- CreateIndex
CREATE INDEX "Vst_shopId_createdAt_idx" ON "Vst"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vst_shopId_vstNo_key" ON "Vst"("shopId", "vstNo");

-- CreateIndex
CREATE INDEX "VstItem_vstId_idx" ON "VstItem"("vstId");

-- AddForeignKey
ALTER TABLE "SaleItemCancellation" ADD CONSTRAINT "SaleItemCancellation_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemCancellation" ADD CONSTRAINT "SaleItemCancellation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemCancellation" ADD CONSTRAINT "SaleItemCancellation_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vst" ADD CONSTRAINT "Vst_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vst" ADD CONSTRAINT "Vst_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vst" ADD CONSTRAINT "Vst_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vst" ADD CONSTRAINT "Vst_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vst" ADD CONSTRAINT "Vst_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VstItem" ADD CONSTRAINT "VstItem_vstId_fkey" FOREIGN KEY ("vstId") REFERENCES "Vst"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VstItem" ADD CONSTRAINT "VstItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
