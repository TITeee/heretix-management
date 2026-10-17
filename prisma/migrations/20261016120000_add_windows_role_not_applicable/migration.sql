-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "windowsFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "notApplicableByScan" BOOLEAN NOT NULL DEFAULT false;
