-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "missingSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ScanJob" ADD COLUMN "heldAlerts" INTEGER NOT NULL DEFAULT 0;
