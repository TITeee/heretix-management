-- A package is identified by its ecosystem, name and version: the same tuple a
-- vulnerability lookup is keyed on, and the one a PURL encodes. npm and pnpm
-- resolve several versions of the same package side by side, so name alone was
-- never unique within an asset, and the import diff silently collapsed those
-- rows against each other.
CREATE UNIQUE INDEX "Package_assetId_name_version_ecosystem_key"
  ON "Package"("assetId", "name", "version", "ecosystem");
