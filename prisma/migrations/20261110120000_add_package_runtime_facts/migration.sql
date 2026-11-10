-- What the running processes were doing with an OS package when heretix-cli
-- collected it (see Package.inUse, usedBy and needsRestart in schema.prisma).
-- No backfill: a package gets them from the next SBOM upload, and until then
-- inUse is null (not determined), like a package from any other scanner.
ALTER TABLE "Package" ADD COLUMN "inUse" BOOLEAN;
ALTER TABLE "Package" ADD COLUMN "usedBy" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Package" ADD COLUMN "needsRestart" BOOLEAN NOT NULL DEFAULT false;
