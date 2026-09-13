-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "sourcePackage" TEXT;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "sourcePackage" TEXT;
