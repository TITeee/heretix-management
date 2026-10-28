import { prisma } from "@/lib/db"
import { isMaskedSecret } from "@/lib/settings-keys"

/**
 * The value the Settings page means for a secret: what it typed, or, when it
 * sent back the mask it was given (the field left as it was), the stored one.
 */
export async function secretOrStored(key: string, sent: unknown): Promise<string | undefined> {
  if (!isMaskedSecret(sent)) return typeof sent === "string" ? sent : undefined
  const row = await prisma.setting.findUnique({ where: { key } })
  return row?.value
}
