-- CreateEnum
CREATE TYPE "ShopAdminRole" AS ENUM ('ADMIN', 'STAFF');

-- AlterTable
ALTER TABLE "ShopAdmin" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "role" "ShopAdminRole" NOT NULL DEFAULT 'ADMIN';
