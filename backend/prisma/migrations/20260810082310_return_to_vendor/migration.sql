-- CreateEnum
CREATE TYPE "RtvVia" AS ENUM ('WAREHOUSE', 'HEAD_OFFICE');

-- CreateEnum
CREATE TYPE "RtvStatus" AS ENUM ('UNAPPROVED', 'APPROVED');

-- CreateTable
CREATE TABLE "RtvCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RtvCounter_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "Rtv" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "via" "RtvVia" NOT NULL DEFAULT 'WAREHOUSE',
    "vstId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "rtvNo" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "receiverContact" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "RtvStatus" NOT NULL DEFAULT 'UNAPPROVED',
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rtv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RtvItem" (
    "id" SERIAL NOT NULL,
    "rtvId" INTEGER NOT NULL,
    "vstItemId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "packSize" INTEGER NOT NULL,
    "purchasePrice" DOUBLE PRECISION NOT NULL,
    "salesPrice" DOUBLE PRECISION NOT NULL,
    "itemQtyPieces" INTEGER NOT NULL,
    "rtvQtyPieces" INTEGER NOT NULL,
    "rtvValue" DOUBLE PRECISION NOT NULL,
    "remainingQtyPieces" INTEGER NOT NULL,
    "remainingValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RtvItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rtv_shopId_createdAt_idx" ON "Rtv"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Rtv_vstId_idx" ON "Rtv"("vstId");

-- CreateIndex
CREATE UNIQUE INDEX "Rtv_shopId_rtvNo_key" ON "Rtv"("shopId", "rtvNo");

-- CreateIndex
CREATE INDEX "RtvItem_rtvId_idx" ON "RtvItem"("rtvId");

-- CreateIndex
CREATE INDEX "RtvItem_vstItemId_idx" ON "RtvItem"("vstItemId");

-- AddForeignKey
ALTER TABLE "Rtv" ADD CONSTRAINT "Rtv_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rtv" ADD CONSTRAINT "Rtv_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rtv" ADD CONSTRAINT "Rtv_vstId_fkey" FOREIGN KEY ("vstId") REFERENCES "Vst"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rtv" ADD CONSTRAINT "Rtv_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rtv" ADD CONSTRAINT "Rtv_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rtv" ADD CONSTRAINT "Rtv_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RtvItem" ADD CONSTRAINT "RtvItem_rtvId_fkey" FOREIGN KEY ("rtvId") REFERENCES "Rtv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RtvItem" ADD CONSTRAINT "RtvItem_vstItemId_fkey" FOREIGN KEY ("vstItemId") REFERENCES "VstItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RtvItem" ADD CONSTRAINT "RtvItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
