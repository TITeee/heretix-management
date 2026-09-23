import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { withApiErrorHandling } from "@/lib/api-handler"
import { validateCsvRows, type RawCsvRow, type CsvImportRow } from "@/lib/csv-import"

type RowStatus = "create" | "update" | "skip" | "error"
type RowResult = { line: number; hostname: string; status: RowStatus; message?: string }

// Runs the same decide-what-to-do logic against either the live `prisma`
// client (read-only, for a dryRun preview) or an in-flight `tx` (to execute
// alongside the actual writes on commit) — so preview and commit can never
// disagree about what a row will do.
async function planGroup(
  db: Prisma.TransactionClient,
  hostname: string,
  rows: { line: number; row: CsvImportRow }[],
  updateExisting: boolean,
  commit: boolean
): Promise<RowResult[]> {
  const existingAsset = await db.asset.findFirst({ where: { hostname } })

  if (existingAsset && !updateExisting) {
    return rows.map(({ line }) => ({
      line, hostname, status: "skip",
      message: "an asset with this hostname already exists (re-import with \"update existing assets\" to add packages to it)",
    }))
  }

  const assetId = existingAsset
    ? existingAsset.id
    : commit
      ? (await db.asset.create({
          data: {
            name: rows[0].row.name, hostname, assetType: rows[0].row.assetType,
            osId: "manual", osVersionId: "manual", osName: "Manual Asset",
          },
        })).id
      : "preview" // never persisted or dereferenced in preview mode

  const existingPkgKeys = existingAsset
    ? new Set(
        (await db.package.findMany({
          where: { assetId: existingAsset.id, ecosystem: "advisory" },
          select: { name: true, version: true },
        })).map((p) => `${p.name}::${p.version}`)
      )
    : new Set<string>()

  const results: RowResult[] = []
  for (const { line, row } of rows) {
    const key = `${row.product}::${row.version}`
    if (existingPkgKeys.has(key)) {
      results.push({ line, hostname, status: "skip", message: `${row.product} ${row.version} is already on this asset` })
      continue
    }
    existingPkgKeys.add(key) // guards a second new row in this same group from double-creating

    if (commit) {
      await db.package.create({
        data: {
          assetId, name: row.product, version: row.version, rawVersion: row.version,
          ecosystem: "advisory", source: "manual", deps: [],
        },
      })
      if (row.tags.length > 0) {
        const tags = await db.tag.findMany({ where: { type: "asset", name: { in: row.tags } } })
        for (const tag of tags) {
          await db.assetTag.upsert({
            where: { tagId_assetId: { tagId: tag.id, assetId } },
            create: { tagId: tag.id, assetId },
            update: {},
          })
        }
      }
    }

    results.push({ line, hostname, status: existingAsset ? "update" : "create" })
  }
  return results
}

async function runImport(rawRows: RawCsvRow[], updateExisting: boolean, commit: boolean): Promise<RowResult[]> {
  const assetTags = await prisma.tag.findMany({ where: { type: "asset" }, select: { name: true } })
  const existingAssetTagNames = new Set(assetTags.map((t) => t.name.toLowerCase()))

  const validated = validateCsvRows(rawRows, existingAssetTagNames)

  const errorResults: RowResult[] = validated
    .filter((r) => !r.ok)
    .map((r) => ({ line: r.line, hostname: r.ok ? "" : r.hostname, status: "error", message: r.ok ? undefined : r.errors.join("; ") }))

  const groups = new Map<string, { line: number; row: CsvImportRow }[]>()
  for (const r of validated) {
    if (!r.ok) continue
    const group = groups.get(r.row.hostname) ?? []
    group.push({ line: r.line, row: r.row })
    groups.set(r.row.hostname, group)
  }

  const run = async (db: Prisma.TransactionClient) => {
    const rowResults: RowResult[] = []
    for (const [hostname, rows] of groups) {
      rowResults.push(...await planGroup(db, hostname, rows, updateExisting, commit))
    }
    return rowResults
  }

  const rowResults = commit
    // A group's asset + all its packages need to exist together or not at
    // all — half-created rows would leave the exact ambiguous state a CSV
    // import is meant to avoid. 60s/15s timeouts match the existing bulk
    // package-diff transaction in POST /api/assets for the same reason:
    // many sequential create()s per group can outrun the 5s default.
    ? await prisma.$transaction(run, { timeout: 60_000, maxWait: 15_000 })
    : await run(prisma)

  return [...errorResults, ...rowResults].sort((a, b) => a.line - b.line)
}

export const POST = withApiErrorHandling("assets.importCsv", async (req: NextRequest) => {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rows, commit, updateExisting } = await req.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 })
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: "at most 500 rows per import" }, { status: 400 })
  }

  const results = await runImport(rows as RawCsvRow[], !!updateExisting, !!commit)

  if (commit) {
    const created = results.filter((r) => r.status === "create").length
    const updated = results.filter((r) => r.status === "update").length
    const skipped = results.filter((r) => r.status === "skip").length
    const failed = results.filter((r) => r.status === "error").length
    await createAuditLog({
      userId: session.user.id, userEmail: session.user.email,
      action: "asset_bulk_import",
      detail: `rows: ${results.length} (created: ${created}, updated: ${updated}, skipped: ${skipped}, failed: ${failed})`,
    })
  }

  return NextResponse.json({ results })
})
