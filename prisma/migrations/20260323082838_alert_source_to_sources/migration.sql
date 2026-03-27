-- Alert.source (String) → Alert.sources (String[])
-- Step 1: Add sources column with empty array default
ALTER TABLE "Alert" ADD COLUMN "sources" TEXT[] NOT NULL DEFAULT '{}';

-- Step 2: Migrate existing data: wrap source value in an array
UPDATE "Alert" SET "sources" = ARRAY["source"];

-- Step 3: Drop the old source column
ALTER TABLE "Alert" DROP COLUMN "source";
