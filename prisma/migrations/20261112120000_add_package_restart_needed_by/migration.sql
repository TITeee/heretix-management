-- Which of a package's users still run a replaced file of it (see
-- Package.restartNeededBy in schema.prisma). No backfill: it comes with the next
-- SBOM upload from heretix-cli 0.7.1 or later; until then a package that needs a
-- restart does not say for which services.
ALTER TABLE "Package" ADD COLUMN "restartNeededBy" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
