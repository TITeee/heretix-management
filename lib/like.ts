/**
 * Escapes what LIKE and ILIKE read as wildcards (% and _) and their escape character (\),
 * so that text is searched for as it is.
 *
 * Prisma's `contains`, `startsWith` and `endsWith`, and `equals` with `mode: "insensitive"`
 * (ILIKE), hand their text to LIKE as a pattern without escaping it: a search for `100%`
 * would find `1000`, and one for `%` would find everything. Pass user text through this
 * first: `{ contains: escapeLike(search) }`.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&")
}
