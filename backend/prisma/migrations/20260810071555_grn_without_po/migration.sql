-- AlterEnum
ALTER TYPE "GrnStatus" ADD VALUE 'CANCELED';

-- CreateTable
CREATE TABLE "GrnwCounter" (
    "shopId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrnwCounter_pkey" PRIMARY KEY ("shopId")
);
