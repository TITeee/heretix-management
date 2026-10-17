-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "findingsCut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "findingsMatched" INTEGER,
ADD COLUMN     "findingsReturned" INTEGER;

-- AlterTable
ALTER TABLE "ScanJob" ADD COLUMN     "cutPackages" INTEGER NOT NULL DEFAULT 0;
