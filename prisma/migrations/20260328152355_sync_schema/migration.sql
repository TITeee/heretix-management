-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "cvssVector" TEXT,
ADD COLUMN     "epssPercentile" DOUBLE PRECISION,
ADD COLUMN     "epssScore" DOUBLE PRECISION,
ADD COLUMN     "isKev" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolveReason" TEXT,
ALTER COLUMN "sources" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "assetType" TEXT NOT NULL DEFAULT 'host';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "cpe" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'admin';

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataRefreshRunId" TEXT,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetadataRefreshRun" (
    "id" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MetadataRefreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageHistory" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldVersion" TEXT,
    "newVersion" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTag" (
    "tagId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("tagId","assetId")
);

-- CreateTable
CREATE TABLE "PackageTag" (
    "tagId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,

    CONSTRAINT "PackageTag_pkey" PRIMARY KEY ("tagId","packageName")
);

-- CreateIndex
CREATE INDEX "AlertEvent_alertId_idx" ON "AlertEvent"("alertId");

-- CreateIndex
CREATE INDEX "AlertEvent_createdAt_idx" ON "AlertEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AlertEvent_metadataRefreshRunId_idx" ON "AlertEvent"("metadataRefreshRunId");

-- CreateIndex
CREATE INDEX "MetadataRefreshRun_executedAt_idx" ON "MetadataRefreshRun"("executedAt");

-- CreateIndex
CREATE INDEX "PackageHistory_assetId_idx" ON "PackageHistory"("assetId");

-- CreateIndex
CREATE INDEX "PackageHistory_changedAt_idx" ON "PackageHistory"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Alert_isKev_idx" ON "Alert"("isKev");

-- CreateIndex
CREATE INDEX "Alert_epssScore_idx" ON "Alert"("epssScore");

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_metadataRefreshRunId_fkey" FOREIGN KEY ("metadataRefreshRunId") REFERENCES "MetadataRefreshRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageHistory" ADD CONSTRAINT "PackageHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTag" ADD CONSTRAINT "AssetTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTag" ADD CONSTRAINT "AssetTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageTag" ADD CONSTRAINT "PackageTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
