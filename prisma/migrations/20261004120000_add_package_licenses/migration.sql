-- AlterTable
ALTER TABLE "Package" ADD COLUMN "licenses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
