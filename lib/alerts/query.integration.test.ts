import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { loadAllListAlerts } from "@/lib/alerts/load-all"
import { type Alert, type ListFilters, NONE_OPTION, groupBySourcePackage, matchesListFilters } from "@/lib/alerts/list-filters"
import { allListAlertIds, listAlertPage } from "@/lib/alerts/query"
import { NONE, parseAlertQuery, type AlertQuery, type SortColumn } from "@/lib/alerts/query-params"
import { distroPrioritySortKey } from "@/lib/distro-priority"
import { fixStatusSortKey } from "@/lib/fix-status"

// The server-side list (lib/alerts/query.ts) against the browser-side code the
// page ran until now (lib/alerts/list-filters.ts), over the same alerts and
// hundreds of filter combinations. The two agreed differences are applied to
// the reference: both dependency kinds picked shows either, and the package
// search matches any package of a grouped row.

const NOW = new Date("2026-10-20T12:00:00Z")
const HOUR = 60 * 60 * 1000

// A small deterministic random generator, so a failure reproduces.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

let rand = rng(42)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
const some = <T,>(xs: readonly T[], max = 3): T[] => [...new Set(Array.from({ length: 1 + Math.floor(rand() * max) }, () => pick(xs)))]

const STATUSES = ["open", "in_progress", "resolved", "ignored"]
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "MODERATE", "LOW", null]
const SCORES = [null, 0, 2.5, 5.5, 7.5, 9.8]
const ECOSYSTEMS = ["Red Hat:9", "Ubuntu:22.04:LTS", "npm", "advisory"]
const SOURCES = ["osv", "nvd", "red-hat", "red-hat-vex"]
const PRIORITIES = [null, "low", "moderate", "important", "medium", "high", "bogus"]
const FIX_STATUSES = [null, "", "affected", "deferred", "will_not_fix", "out_of_support", "under_investigation", "mystery"]
// Binary packages of one source package, as a kernel ships them.
const FAMILIES = [
  { source: "kernel", names: ["kernel", "kernel-core", "kernel-modules", "kernel-tools"] },
  { source: "binutils", names: ["binutils", "binutils-gold"] },
  { source: null, names: ["openssl", "lodash", "bash", "glibc", "curl"] },
]

let all: Alert[] = []
let tagIds: string[] = []
let assetIds: string[] = []

async function seed() {
  await resetDb()
  const tags = await Promise.all(["prod", "dmz", "pci"].map((name) => prisma.tag.create({ data: { name, type: "custom" } })))
  tagIds = tags.map((t) => t.id)
  const assets = await Promise.all([1, 2, 3].map((i) =>
    prisma.asset.create({ data: { name: `host-${i}`, hostname: `host-${i}`, osId: "rhel", osVersionId: "9.8", osName: "RHEL 9.8" } })))
  assetIds = assets.map((a) => a.id)
  await prisma.assetTag.createMany({ data: [{ assetId: assetIds[0], tagId: tagIds[0] }, { assetId: assetIds[1], tagId: tagIds[1] }] })
  await prisma.packageTag.createMany({ data: [{ packageName: "openssl", tagId: tagIds[2] }, { packageName: "kernel-core", tagId: tagIds[0] }] })

  const alerts: object[] = []
  const packages = new Map<string, object>()
  let cve = 0
  for (const assetId of assetIds) {
    for (let i = 0; i < 60; i++) {
      const family = pick(FAMILIES)
      const version = pick(["1.0", "2.0", "5.14.0-687.10.1.el9_8"])
      const externalId = rand() < 0.08 ? `MAL-2026-${++cve}` : `CVE-2026-${String(++cve).padStart(5, "0")}`
      const shared = {
        severity: pick(SEVERITIES), cvssScore: pick(SCORES), isKev: rand() < 0.15, epssScore: rand() < 0.3 ? null : Math.round(rand() * 1000) / 1000,
        ecosystem: pick(ECOSYSTEMS), sources: some(SOURCES, 2), distroPriority: pick(PRIORITIES), fixStatus: pick(FIX_STATUSES),
        detectedAt: new Date(NOW.getTime() - Math.floor(rand() * 90) * 24 * HOUR),
        dueDate: rand() < 0.2 ? null : new Date(NOW.getTime() + (Math.floor(rand() * 40) - 10) * 12 * HOUR),
      }
      // A finding usually hits several binary packages of one family.
      const names = family.source ? some(family.names, family.names.length) : [pick(family.names)]
      for (const packageName of names) {
        alerts.push({
          assetId, packageName, packageVersion: version, externalId, sourcePackage: family.source,
          status: rand() < 0.75 ? pick(["open", "in_progress"]) : pick(STATUSES), ...shared,
        })
        // Most packages are in the inventory, a few have gone; direct, indirect or unknown.
        if (rand() < 0.85) {
          packages.set(`${assetId}|${packageName}|${version}`, {
            assetId, name: packageName, version, rawVersion: version, ecosystem: shared.ecosystem, source: "sbom", deps: [],
            direct: pick([true, false, null]),
          })
        }
      }
    }
  }
  await prisma.alert.createMany({ data: alerts as never })
  await prisma.package.createMany({ data: [...packages.values()] as never, skipDuplicates: true })
  all = await loadAllListAlerts({})
}

/** The rows the browser-side code shows for `q`, with the agreed differences. */
function reference(q: AlertQuery): Alert[] {
  const mapNone = (values: string[]) => new Set(values.map((v) => (v === NONE ? NONE_OPTION : v)))
  const bothKinds = q.dependencies.length === 2
  const filters: ListFilters = {
    asset: new Set(q.assetIds), status: new Set(q.statuses), cvss: new Set(q.severityTiers), kev: new Set(q.risks),
    ecosystem: new Set(q.ecosystems), sources: new Set(q.sources), tag: new Set(q.tagIds),
    dependency: bothKinds ? new Set() : new Set(q.dependencies), inventory: new Set(q.inventories), due: new Set(q.dues),
    distro: mapNone(q.distroLabels), fixStatus: mapNone(q.fixStatuses),
  }
  const alerts = all.filter((a) =>
    (!q.packageName || a.packageName === q.packageName) &&
    (!q.packageVersion || a.packageVersion === q.packageVersion) &&
    (!bothKinds || a.packageDirect === true || a.packageDirect === false) &&
    matchesListFilters(a, filters, NOW))
  return groupBySourcePackage(alerts).filter((row) => {
    const members = row._groupMembers ?? [row]
    if (q.q && !members.some((m) => m.packageName.toLowerCase().includes(q.q!.toLowerCase()))) return false
    if (q.vuln && !row.externalId.toLowerCase().includes(q.vuln.toLowerCase())) return false
    return true
  })
}

async function serverRows(q: AlertQuery): Promise<{ rows: Alert[]; total: number }> {
  const rows: Alert[] = []
  let total = 0
  for (let page = 1; ; page++) {
    const r = await listAlertPage({ ...q, page, pageSize: 50 }, NOW)
    total = r.total
    rows.push(...r.rows)
    if (r.rows.length < 50) break
  }
  return { rows, total }
}

const members = (row: Alert) => (row._groupMembers ?? [row]).map((m) => m.id).sort()

function sortKey(row: Alert, column: SortColumn): number | string | undefined {
  switch (column) {
    case "distroPriority": return distroPrioritySortKey(row.ecosystem, row.distroPriority)
    case "fixStatus": return fixStatusSortKey(row.fixStatus)
    case "isKev": return row.isKev ? 1 : 0
    case "externalId": return row.externalId
    case "detectedAt": case "dueDate": case "updatedAt": {
      const v = row[column]
      return v ? new Date(v).getTime() : undefined
    }
    default: return row[column] ?? undefined
  }
}

function randomQuery(): AlertQuery {
  const params: Record<string, string> = {}
  const maybe = (p: number, key: string, value: () => string) => { if (rand() < p) params[key] = value() }
  maybe(0.3, "assetId", () => some(assetIds, 2).join(","))
  maybe(0.5, "status", () => (rand() < 0.2 ? "" : some(STATUSES, 3).join(",")))
  maybe(0.3, "severity", () => some(["critical", "high", "medium", "low", "na"], 3).join(","))
  maybe(0.2, "risk", () => some(["kev", "malware"], 2).join(","))
  maybe(0.2, "ecosystem", () => some(ECOSYSTEMS, 2).join(","))
  maybe(0.2, "source", () => some(SOURCES, 2).join(","))
  maybe(0.2, "tag", () => some(tagIds, 2).join(","))
  maybe(0.25, "dependency", () => some(["direct", "indirect"], 2).join(","))
  maybe(0.2, "inventory", () => some(["present", "missing"], 2).join(","))
  maybe(0.25, "due", () => some(["overdue", "urgent", "warning", "ok", "unscored"], 3).join(","))
  maybe(0.2, "distro", () => some(["Red Hat: low", "Red Hat: important", "Ubuntu: medium", "Microsoft: moderate", NONE], 3).join(","))
  maybe(0.2, "fixStatus", () => some(["affected", "deferred", "will_not_fix", "mystery", NONE], 3).join(","))
  maybe(0.15, "packageName", () => pick(["kernel-core", "openssl", "binutils"]))
  maybe(0.1, "packageVersion", () => pick(["1.0", "2.0"]))
  maybe(0.2, "q", () => pick(["kern", "MODULES", "ssl", "gold", "x"]))
  maybe(0.1, "vuln", () => pick(["cve-2026-0001", "MAL", "000"]))
  params.sort = pick(["cvssScore", "distroPriority", "fixStatus", "isKev", "epssScore", "externalId", "detectedAt", "dueDate", "updatedAt"])
  params.dir = pick(["asc", "desc"])
  return parseAlertQuery(params)
}

describe("the Alerts list in SQL agrees with the browser-side list", () => {
  beforeAll(async () => {
    rand = rng(42)
    await seed()
  }, 60_000)

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("has test data with grouped rows, gone packages and every status", () => {
    expect(all.length).toBeGreaterThan(200)
    expect(groupBySourcePackage(all).some((r) => (r._groupMembers?.length ?? 0) > 2)).toBe(true)
    expect(all.some((a) => a.packageExists === false)).toBe(true)
    expect(new Set(all.map((a) => a.status)).size).toBe(4)
  })

  it("shows the same rows, with the same alerts in them, for 300 random filter combinations", async () => {
    rand = rng(7)
    let nonEmpty = 0
    for (let i = 0; i < 300; i++) {
      const q = randomQuery()
      const expected = reference(q)
      const { rows, total } = await serverRows(q)
      const context = JSON.stringify({ i, q })

      expect(total, context).toBe(expected.length)
      expect(rows.length, context).toBe(expected.length)
      // Same rows, same members, same representative.
      const byRep = new Map(expected.map((r) => [r.id, r]))
      for (const row of rows) {
        const ref = byRep.get(row.id)
        expect(ref, `${context} unexpected row ${row.id}`).toBeDefined()
        expect(members(row), context).toEqual(members(ref!))
      }
      // In order: each row's sort key is not past the next one's; rows without one come last.
      for (let k = 1; k < rows.length; k++) {
        const a = sortKey(rows[k - 1], q.sort.column)
        const b = sortKey(rows[k], q.sort.column)
        if (a === undefined) expect(b, `${context} at ${k}`).toBeUndefined()
        else if (b !== undefined && a !== b) expect(q.sort.desc ? a > b : a < b, `${context} at ${k}: ${a} then ${b}`).toBe(true)
      }
      if (expected.length > 0) nonEmpty++
    }
    // The combinations must actually exercise the filters, not only return nothing.
    expect(nonEmpty).toBeGreaterThan(100)
  }, 300_000)

  it("finds every alert behind a view, as its pages show them, for 40 random filter combinations", async () => {
    rand = rng(11)
    for (let i = 0; i < 40; i++) {
      const q = randomQuery()
      const expected = reference(q)
      const { rowCount, alertIds } = await allListAlertIds(q, NOW)
      const context = JSON.stringify({ i, q })
      expect(rowCount, context).toBe(expected.length)
      expect([...alertIds].sort(), context).toEqual(expected.flatMap((r) => r._groupMembers ?? [r]).map((a) => a.id).sort())
    }
  }, 120_000)

  it("pages without repeating or skipping a row", async () => {
    const q = parseAlertQuery({ status: "", sort: "isKev" })
    const seen: string[] = []
    let total = 0
    for (let page = 1; ; page++) {
      const r = await listAlertPage({ ...q, page, pageSize: 10 }, NOW)
      total = r.total
      seen.push(...r.rows.map((row) => row.id))
      if (r.rows.length < 10) break
    }
    expect(seen.length).toBe(total)
    expect(new Set(seen).size).toBe(total)
  })

  it("reports the total on a page past the end", async () => {
    const q = parseAlertQuery({ status: "" })
    const first = await listAlertPage(q, NOW)
    const past = await listAlertPage({ ...q, page: 10_000 }, NOW)
    expect(past.rows).toEqual([])
    expect(past.total).toBe(first.total)
  })
})
