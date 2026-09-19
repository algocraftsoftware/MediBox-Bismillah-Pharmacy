-- CreateEnum
CREATE TYPE "GrnKind" AS ENUM ('STANDARD', 'ADJUST_WITH_PO');

-- CreateEnum
CREATE TYPE "AdjOthersType" AS ENUM ('SUPPLIER', 'OTHERS');

-- CreateEnum
CREATE TYPE "AdjStatus" AS ENUM ('UNAPPROVED', 'APPROVED');

-- AlterTable
ALTER TABLE "Grn" ADD COLUMN     "kind" "GrnKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "rtvAdjustmentValue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GrnaCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrnaCounter_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "GrnRtvAdjustment" (
    "id" SERIAL NOT NULL,
    "grnId" INTEGER NOT NULL,
    "rtvId" INTEGER NOT NULL,
    "adjustmentAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GrnRtvAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjOthersCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdjOthersCounter_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "AdjOthers" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "adjType" "AdjOthersType" NOT NULL DEFAULT 'SUPPLIER',
    "via" "RtvVia" NOT NULL DEFAULT 'WAREHOUSE',
    "txnNo" TEXT NOT NULL,
    "remarks" TEXT,
    "totalAdjustmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AdjStatus" NOT NULL DEFAULT 'UNAPPROVED',
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdjOthers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjOthersItem" (
    "id" SERIAL NOT NULL,
    "adjOthersId" INTEGER NOT NULL,
    "rtvId" INTEGER NOT NULL,
    "adjustmentAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AdjOthersItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrnRtvAdjustment_grnId_idx" ON "GrnRtvAdjustment"("grnId");

-- CreateIndex
CREATE INDEX "GrnRtvAdjustment_rtvId_idx" ON "GrnRtvAdjustment"("rtvId");

-- CreateIndex
CREATE INDEX "AdjOthers_shopId_createdAt_idx" ON "AdjOthers"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdjOthers_shopId_txnNo_key" ON "AdjOthers"("shopId", "txnNo");

-- CreateIndex
CREATE INDEX "AdjOthersItem_adjOthersId_idx" ON "AdjOthersItem"("adjOthersId");

-- CreateIndex
CREATE INDEX "AdjOthersItem_rtvId_idx" ON "AdjOthersItem"("rtvId");

-- AddForeignKey
ALTER TABLE "GrnRtvAdjustment" ADD CONSTRAINT "GrnRtvAdjustment_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "Grn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnRtvAdjustment" ADD CONSTRAINT "GrnRtvAdjustment_rtvId_fkey" FOREIGN KEY ("rtvId") REFERENCES "Rtv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjOthers" ADD CONSTRAINT "AdjOthers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjOthers" ADD CONSTRAINT "AdjOthers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjOthers" ADD CONSTRAINT "AdjOthers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjOthers" ADD CONSTRAINT "AdjOthers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjOthers" ADD CONSTRAINT "AdjOthers_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjOthersItem" ADD CONSTRAINT "AdjOthersItem_adjOthersId_fkey" FOREIGN KEY ("adjOthersId") REFERENCES "AdjOthers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjOthersItem" ADD CONSTRAINT "AdjOthersItem_rtvId_fkey" FOREIGN KEY ("rtvId") REFERENCES "Rtv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
