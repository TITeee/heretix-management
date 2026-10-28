const MiB = 1024 * 1024

/** The most a JSON request body may be, unless the route allows more. */
export const JSON_BODY_MAX_BYTES = 1 * MiB

/**
 * The most an import (SBOM, CSV, VEX) may be: MAX_IMPORT_BODY_MB, 50 by default.
 * A heretix-cli SBOM is about 1.1 KB a package, so 50 MB holds some 44,000.
 */
export function importBodyMaxBytes(): number {
  const mb = Number(process.env.MAX_IMPORT_BODY_MB)
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * MiB
}

/** A body over the route's limit; withApiErrorHandling answers it with 413. */
export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body is larger than ${Math.round(maxBytes / MiB)} MB`)
  }
}

/**
 * The request's body parsed as JSON, read no further than `maxBytes`.
 *
 * `req.json()` read a body of any size into memory, so one large request could
 * use up the server's. A Content-Length over the limit is refused before
 * reading; a body without one (chunked) is counted while it is read. Bad JSON
 * throws a SyntaxError, which withApiErrorHandling answers with 400. Typed
 * like `req.json()`, which it replaces, so the routes check the fields as before.
 */
export async function readJsonBody(req: Request, maxBytes: number = JSON_BODY_MAX_BYTES): Promise<any> {
  const declared = Number(req.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes)
  if (!req.body) return JSON.parse("")

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new BodyTooLargeError(maxBytes)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

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
