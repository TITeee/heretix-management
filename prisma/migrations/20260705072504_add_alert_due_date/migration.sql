-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Package" ALTER COLUMN "deps" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Alert_dueDate_idx" ON "Alert"("dueDate");
