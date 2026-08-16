-- DropForeignKey
ALTER TABLE "Grn" DROP CONSTRAINT "Grn_receivedById_fkey";

-- AlterTable
ALTER TABLE "Grn" ALTER COLUMN "receivedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "ShopAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
