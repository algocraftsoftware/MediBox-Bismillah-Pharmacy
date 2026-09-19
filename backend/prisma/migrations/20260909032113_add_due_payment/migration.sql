-- CreateTable
CREATE TABLE "DuePayment" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "saleId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidMobileBanking" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidCard" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collectedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuePayment_shopId_createdAt_idx" ON "DuePayment"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "DuePayment_storeId_createdAt_idx" ON "DuePayment"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "DuePayment_saleId_idx" ON "DuePayment"("saleId");

-- AddForeignKey
ALTER TABLE "DuePayment" ADD CONSTRAINT "DuePayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuePayment" ADD CONSTRAINT "DuePayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuePayment" ADD CONSTRAINT "DuePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuePayment" ADD CONSTRAINT "DuePayment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "ShopAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
