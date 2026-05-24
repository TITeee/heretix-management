-- Remove default flag from old default tags
UPDATE "Tag" SET "isDefault" = false WHERE "name" IN ('Production', 'Development', 'Staging', 'Critical Packages');

-- Insert new default tags if they don't exist, update isDefault if they do
INSERT INTO "Tag" ("id", "name", "type", "color", "description", "isDefault", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Internet Facing', 'asset',   '#dc2626', 'Assets directly exposed to the internet. (Default tag)',                                                     true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Public Endpoint', 'package', '#ea580c', 'Packages directly accessible from the internet, e.g. Apache, Tomcat, Nginx. (Default tag)', true, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE SET "isDefault" = true, "color" = EXCLUDED."color", "description" = EXCLUDED."description", "updatedAt" = NOW();
