/**
 * Writing CSV safely. Used by the Reports page's CSV (lib/reports/executive-csv.ts).
 * Client-safe.
 */

const FORMULA_START = /^[=+\-@\t\r]/

/**
 * One CSV cell: quoted, quotes doubled, and a value that would start a formula
 * prefixed with `'` so a spreadsheet shows it as text (OWASP's CSV injection advice).
 * Numbers are written as they are: a negative one is not text that runs.
 */
export function escapeCSV(v: unknown): string {
  let s = v == null ? "" : String(v)
  if (typeof v !== "number" && FORMULA_START.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
