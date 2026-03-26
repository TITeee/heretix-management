-- Migration: 旧形式のディストロエコシステム文字列をバージョン付き形式に更新
-- 旧: "Ubuntu", "Debian", "AlmaLinux"
-- 新: "Ubuntu:22.04:LTS", "Debian:12", "AlmaLinux:9" 等

-- Step 1: 旧形式の Alert を削除（semver 誤検知ロジックで生成されたため信頼性が低い）
DELETE FROM "Alert" WHERE ecosystem IN ('Ubuntu', 'Debian', 'AlmaLinux');

-- Step 2: Asset の osVersionId を使って Package の ecosystem を更新（Ubuntu）
UPDATE "Package" p
SET ecosystem = 'Ubuntu:' || a."osVersionId" || ':LTS'
FROM "Asset" a
WHERE p."assetId" = a.id
  AND p.ecosystem = 'Ubuntu'
  AND a."osVersionId" IN ('20.04', '22.04', '24.04');

-- Step 3: Package の ecosystem を更新（Debian）
UPDATE "Package" p
SET ecosystem = 'Debian:' || a."osVersionId"
FROM "Asset" a
WHERE p."assetId" = a.id
  AND p.ecosystem = 'Debian'
  AND a."osVersionId" IN ('11', '12');

-- Step 4: Package の ecosystem を更新（AlmaLinux）
UPDATE "Package" p
SET ecosystem = 'AlmaLinux:' || a."osVersionId"
FROM "Asset" a
WHERE p."assetId" = a.id
  AND p.ecosystem = 'AlmaLinux'
  AND a."osVersionId" IN ('8', '9');
