-- The source package version of an OS package, when it differs from the binary's own
-- (see Package.sourceVersion in schema.prisma). Nullable, no backfill: a package gets it
-- from the next SBOM upload, and until then heretix-api compares the binary's version.
ALTER TABLE "Package" ADD COLUMN "sourceVersion" TEXT;
