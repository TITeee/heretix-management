-- AlterTable: Add vexJustification to Alert (VEX not_affected justification)
ALTER TABLE "Alert" ADD COLUMN "vexJustification" TEXT;

-- AlterTable: Add direct dependency flag and deps PURL list to Package
ALTER TABLE "Package" ADD COLUMN "direct" BOOLEAN;
ALTER TABLE "Package" ADD COLUMN "deps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
