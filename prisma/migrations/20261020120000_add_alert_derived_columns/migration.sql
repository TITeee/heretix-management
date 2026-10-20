-- Columns PostgreSQL computes from each alert's own values, so the Alerts list
-- can filter, group and count in SQL. Each mirrors a TypeScript function; the
-- integration test alert-derived-columns checks they agree.
--
-- One ALTER TABLE, so the table is rewritten once (stored generated columns
-- are computed for every existing row), under an exclusive lock: about a
-- minute per 400,000 alerts.
ALTER TABLE "Alert"
  -- The Alerts list row an alert belongs to (alerts-table.tsx groups by it):
  -- asset, upstream source package (or the package itself), version,
  -- vulnerability. Separated by U+001F, which none of the parts contains.
  ADD COLUMN "findingKey" TEXT GENERATED ALWAYS AS (
    "assetId" || chr(31) || COALESCE("sourcePackage", "packageName") || chr(31) || "packageVersion" || chr(31) || "externalId"
  ) STORED,
  -- getAlertSeverityTier (lib/severity.ts): the stored severity word decides;
  -- the score is only a fallback, with 0 or none meaning N/A.
  ADD COLUMN "severityTier" TEXT GENERATED ALWAYS AS (
    CASE upper("severity")
      WHEN 'CRITICAL' THEN 'critical'
      WHEN 'HIGH' THEN 'high'
      WHEN 'MEDIUM' THEN 'medium'
      WHEN 'MODERATE' THEN 'medium'
      WHEN 'LOW' THEN 'low'
      ELSE CASE
        WHEN "cvssScore" IS NULL OR "cvssScore" = 0 OR "cvssScore" = 'NaN'::float8 THEN 'na'
        WHEN "cvssScore" >= 9 THEN 'critical'
        WHEN "cvssScore" >= 7 THEN 'high'
        WHEN "cvssScore" >= 4 THEN 'medium'
        ELSE 'low'
      END
    END
  ) STORED,
  -- distroPriorityLabel (lib/distro-priority.ts): "<distro>: <rating>", the
  -- distro being the ecosystem's first part ("Red Hat:9" -> "Red Hat"), or
  -- Microsoft for a vendor-advisory finding. Null without a rating.
  ADD COLUMN "distroLabel" TEXT GENERATED ALWAYS AS (
    CASE
      WHEN "distroPriority" IS NULL OR "distroPriority" = '' THEN NULL
      WHEN "ecosystem" = 'advisory' THEN 'Microsoft: ' || "distroPriority"
      ELSE btrim(split_part("ecosystem", ':', 1)) || ': ' || "distroPriority"
    END
  ) STORED;

-- CreateIndex
CREATE INDEX "Alert_findingKey_idx" ON "Alert"("findingKey");
