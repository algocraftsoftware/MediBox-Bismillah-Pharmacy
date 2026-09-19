/*
  Warnings:

  - You are about to drop the column `signatureUrl` on the `Shop` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "signatureUrl",
ADD COLUMN     "approvedBySignatureUrl" TEXT,
ADD COLUMN     "preparedBySignatureUrl" TEXT,
ADD COLUMN     "reviewedBySignatureUrl" TEXT;
