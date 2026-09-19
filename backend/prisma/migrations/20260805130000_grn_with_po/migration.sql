-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('UNAPPROVED', 'APPROVED');

-- CreateTable
CREATE TABLE "GrnCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrnCounter_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "Grn" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "purchaseOrderId" INTEGER,
    "transactionNo" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "paymentType" TEXT NOT NULL,
    "transactionRefNo" TEXT,
    "receivedById" INTEGER NOT NULL,
    "status" "GrnStatus" NOT NULL DEFAULT 'UNAPPROVED',
    "createdById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "invoiceDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiryAdjustmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attachmentUrl" TEXT,
    "totalTradeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgGpPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrnItem" (
    "id" SERIAL NOT NULL,
    "grnId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "displayCategorySnapshot" TEXT,
    "orderQtyPieces" INTEGER NOT NULL DEFAULT 0,
    "rcvQtyBox" INTEGER NOT NULL DEFAULT 0,
    "rcvQtyPieces" INTEGER NOT NULL DEFAULT 0,
    "bonusQtyBox" INTEGER NOT NULL DEFAULT 0,
    "bonusQtyPieces" INTEGER NOT NULL DEFAULT 0,
    "totalQtyPieces" INTEGER NOT NULL DEFAULT 0,
    "tradePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mrp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "batchNo" TEXT,
    "expiryDate" TIMESTAMP(3),
    "netTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "GrnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Grn_shopId_createdAt_idx" ON "Grn"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Grn_shopId_transactionNo_key" ON "Grn"("shopId", "transactionNo");

-- CreateIndex
CREATE INDEX "GrnItem_grnId_idx" ON "GrnItem"("grnId");

-- CreateIndex
CREATE INDEX "GrnItem_productId_idx" ON "GrnItem"("productId");

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnItem" ADD CONSTRAINT "GrnItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "Grn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnItem" ADD CONSTRAINT "GrnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

