import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/db"
import { resetDb } from "@/lib/test-utils/db"
import { getAlertSeverityTier } from "@/lib/severity"
import { distroPriorityLabel } from "@/lib/distro-priority"

// Alert.findingKey, severityTier and distroLabel are computed by PostgreSQL
// (migration 20261020120000_add_alert_derived_columns). They must say exactly
// what the TypeScript that decides the same thing says, or the Alerts list
// would filter and group differently from every other screen.

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "MODERATE", "LOW", "critical", "Moderate", "NONE", "", null]
const SCORES = [null, 0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10]
const ECOSYSTEMS = ["Red Hat:9", "Ubuntu:22.04:LTS", "Debian:12", "advisory", "npm", " Rocky Linux :9", ""]
const PRIORITIES = [null, "", "low", "moderate", "important"]
const SOURCE_PACKAGES = [null, "", "kernel"]

let n = 0
const nextId = () => `CVE-2026-${String(++n).padStart(5, "0")}`

async function createAsset() {
  return prisma.asset.create({
    data: { name: "host-1", hostname: "host-1", osId: "rhel", osVersionId: "9.8", osName: "RHEL 9.8" },
  })
}

describe("Alert columns computed by PostgreSQL", () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("severityTier agrees with getAlertSeverityTier for every severity word and score", async () => {
    const asset = await createAsset()
    const rows = SEVERITIES.flatMap((severity) => SCORES.map((cvssScore) => ({ severity, cvssScore, externalId: nextId() })))
    await prisma.alert.createMany({
      data: rows.map((r) => ({ assetId: asset.id, packageName: "openssl", packageVersion: "1.0", ecosystem: "Red Hat:9", sources: [], ...r })),
    })

    const stored = await prisma.alert.findMany({ select: { severity: true, cvssScore: true, severityTier: true } })
    expect(stored).toHaveLength(rows.length)
    for (const a of stored) {
      expect({ severity: a.severity, cvssScore: a.cvssScore, tier: a.severityTier })
        .toEqual({ severity: a.severity, cvssScore: a.cvssScore, tier: getAlertSeverityTier(a.severity, a.cvssScore) })
    }
  })

  it("distroLabel agrees with distroPriorityLabel for every ecosystem and rating", async () => {
    const asset = await createAsset()
    const rows = ECOSYSTEMS.flatMap((ecosystem) => PRIORITIES.map((distroPriority) => ({ ecosystem, distroPriority, externalId: nextId() })))
    await prisma.alert.createMany({
      data: rows.map((r) => ({ assetId: asset.id, packageName: "openssl", packageVersion: "1.0", sources: [], ...r })),
    })

    const stored = await prisma.alert.findMany({ select: { ecosystem: true, distroPriority: true, distroLabel: true } })
    expect(stored).toHaveLength(rows.length)
    for (const a of stored) {
      expect({ ecosystem: a.ecosystem, distroPriority: a.distroPriority, label: a.distroLabel })
        .toEqual({ ecosystem: a.ecosystem, distroPriority: a.distroPriority, label: distroPriorityLabel(a.ecosystem, a.distroPriority) })
    }
  })

  it("findingKey is the asset, source package (or package), version and vulnerability the list groups by", async () => {
    const asset = await createAsset()
    await prisma.alert.createMany({
      data: SOURCE_PACKAGES.flatMap((sourcePackage) =>
        ["kernel-core", "kernel-modules"].map((packageName) => ({
          assetId: asset.id, packageName, packageVersion: "5.14.0-687.10.1.el9_8", ecosystem: "Red Hat:9",
          externalId: "CVE-2026-00001", sourcePackage, sources: [],
        }))
      ).map((r, i) => ({ ...r, packageVersion: `${r.packageVersion}.${i}` })),
    })

    const stored = await prisma.alert.findMany({
      select: { assetId: true, sourcePackage: true, packageName: true, packageVersion: true, externalId: true, findingKey: true },
    })
    for (const a of stored) {
      expect(a.findingKey).toBe([a.assetId, a.sourcePackage ?? a.packageName, a.packageVersion, a.externalId].join("\x1f"))
    }
  })

  it("puts binary packages of one source package, version and CVE under one key", async () => {
    const asset = await createAsset()
    await prisma.alert.createMany({
      data: ["kernel", "kernel-core", "kernel-modules"].map((packageName) => ({
        assetId: asset.id, packageName, packageVersion: "5.14.0-687.10.1.el9_8", ecosystem: "Red Hat:9",
        externalId: "CVE-2026-00001", sourcePackage: "kernel", sources: [],
      })),
    })
    const keys = new Set((await prisma.alert.findMany({ select: { findingKey: true } })).map((a) => a.findingKey))
    expect(keys.size).toBe(1)
  })

  it("follows an update of the values it is computed from", async () => {
    const asset = await createAsset()
    const alert = await prisma.alert.create({
      data: { assetId: asset.id, packageName: "openssl", packageVersion: "1.0", ecosystem: "Red Hat:9", externalId: nextId(), sources: [], severity: "LOW", cvssScore: 3 },
    })
    const updated = await prisma.alert.update({ where: { id: alert.id }, data: { severity: "CRITICAL", distroPriority: "important" } })
    expect(updated.severityTier).toBe("critical")
    expect(updated.distroLabel).toBe("Red Hat: important")
  })
})
