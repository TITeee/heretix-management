/**
 * A request body's list of ids/names: trimmed, blank entries and duplicates
 * dropped. Returns null unless the value is an array of strings that leaves at
 * least one entry, so a route can answer 400 instead of writing nothing (or
 * letting a non-string reach Prisma as a 500).
 */
export function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return null
  const list = [...new Set(value.map((v: string) => v.trim()).filter((v) => v.length > 0))]
  return list.length > 0 ? list : null
}
