import { prisma } from "@/lib/db"

/**
 * Truncate all app tables and reset identity sequences. Call in beforeEach()
 * for every integration test — tests run against a disposable database
 * (TEST_DATABASE_URL), never the dev database.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "User", "Asset", "Package", "ScanJob", "Alert", "AlertEvent",
      "MetadataRefreshRun", "AlertComment", "AlertChatMessage", "PackageHistory",
      "Setting", "Tag", "AssetTag", "PackageTag", "AuditLog"
    RESTART IDENTITY CASCADE
  `)
}
