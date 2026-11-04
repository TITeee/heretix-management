-- Insert the Mission Critical default tag if it doesn't exist, update isDefault if it does
INSERT INTO "Tag" ("id", "name", "type", "color", "description", "isDefault", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Mission Critical', 'asset', '#ca8a04', 'Assets whose compromise or outage would stop the business, e.g. core systems, systems holding personal data. (Default tag)', true, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE SET "isDefault" = true, "color" = EXCLUDED."color", "description" = EXCLUDED."description", "updatedAt" = NOW();
