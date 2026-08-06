-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "ignoreReason" TEXT;

-- Backfill: until now, an ignored alert carrying a VEX justification could only
-- mean "not affected", since that is the sole state the exporter ever emitted.
-- Labelling those rows preserves their existing meaning exactly.
-- Ignored rows *without* a justification are deliberately left NULL: those are
-- the unrecorded judgments this column exists to surface.
UPDATE "Alert"
SET "ignoreReason" = 'not_affected'
WHERE "status" = 'ignored' AND "vexJustification" IS NOT NULL;
