-- AlterTable (nullable first so existing rows can be backfilled)
ALTER TABLE "Shop" ADD COLUMN "code" TEXT;

-- Backfill existing shops with their (already-unique) slug as a starting code
UPDATE "Shop" SET "code" = UPPER("slug") WHERE "code" IS NULL;

-- Now enforce NOT NULL + UNIQUE
ALTER TABLE "Shop" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Shop_code_key" ON "Shop"("code");
