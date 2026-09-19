-- CreateEnum
CREATE TYPE "RequisitionMode" AS ENUM ('PHARMA', 'NON_PHARMA');

-- CreateEnum
CREATE TYPE "RequisitionType" AS ENUM ('REGULAR', 'URGENT', 'OTHERS');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('UNAPPROVED', 'APPROVED');

-- CreateTable
CREATE TABLE "RequisitionCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RequisitionCounter_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "deliverTo" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "requisitionNo" TEXT NOT NULL,
    "mode" "RequisitionMode" NOT NULL,
    "type" "RequisitionType" NOT NULL DEFAULT 'REGULAR',
    "consumptionDays" INTEGER NOT NULL DEFAULT 30,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'UNAPPROVED',
    "reorderBelowOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "totalPPAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMrpAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgGpPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisitionItem" (
    "id" SERIAL NOT NULL,
    "requisitionId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qtyBox" INTEGER NOT NULL DEFAULT 0,
    "qtyPieces" INTEGER NOT NULL DEFAULT 0,
    "ppPerPiece" DOUBLE PRECISION NOT NULL,
    "mrpPerPiece" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "gp" DOUBLE PRECISION NOT NULL,
    "gpPct" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "PurchaseRequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseRequisition_shopId_createdAt_idx" ON "PurchaseRequisition"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_shopId_requisitionNo_key" ON "PurchaseRequisition"("shopId", "requisitionNo");

-- CreateIndex
CREATE INDEX "PurchaseRequisitionItem_requisitionId_idx" ON "PurchaseRequisitionItem"("requisitionId");

-- CreateIndex
CREATE INDEX "PurchaseRequisitionItem_productId_idx" ON "PurchaseRequisitionItem"("productId");

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionItem" ADD CONSTRAINT "PurchaseRequisitionItem_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionItem" ADD CONSTRAINT "PurchaseRequisitionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
