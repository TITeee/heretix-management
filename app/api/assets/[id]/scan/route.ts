import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { batchSearch, searchByCPE } from "@/lib/heretix-api"
import { notifySlackIfNeeded, type AlertSummary } from "@/lib/slack"

const BATCH_SIZE = 1000

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: assetId } = await params

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { packages: true, assetTags: true },
  })
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  // Create scan job
  const job = await prisma.scanJob.create({
    data: { assetId, status: "running", startedAt: new Date() },
  })

  try {
    // Filter out packages with empty name or version
    const pkgs = asset.packages.filter(
      (p) => p.name.trim().length > 0 && p.version.trim().length > 0
    )

    // Split into CPE packages and normal packages
    const cpePkgs = pkgs.filter((p) => p.cpe && p.cpe.trim().length > 0)
    const normalPkgs = pkgs.filter((p) => !p.cpe || p.cpe.trim().length === 0)

    const chunks: typeof normalPkgs[] = []
    for (let i = 0; i < normalPkgs.length; i += BATCH_SIZE) {
      chunks.push(normalPkgs.slice(i, i + BATCH_SIZE))
    }

    let newAlertCount = 0
    const newAlertsList: AlertSummary[] = []

    // Normal packages: batch search
    for (const chunk of chunks) {
      const results = await batchSearch(
        chunk.map((p) => ({
          package: p.name,
          version: p.version,
          ...(p.ecosystem.trim().length > 0 && { ecosystem: p.ecosystem }),
        }))
      )

      for (const r of results) {
        for (const v of r.vulnerabilities) {
          const externalId = v.externalId || v.id
          const ecosystem = r.ecosystem ?? ""
          const existing = await prisma.alert.findFirst({
            where: { assetId, packageName: r.package, packageVersion: r.version, ecosystem, externalId },
            select: { id: true },
          })
          if (existing) continue

          const alert = await prisma.alert.create({
            data: {
              assetId,
              packageName: r.package,
              packageVersion: r.version,
              ecosystem,
              externalId,
              sources: v.sources?.length ? v.sources : [v.source || "osv"],
              cvssScore: v.cvssScore ?? null,
              cvssVector: v.cvssVector ?? null,
              severity: v.severity ?? null,
              summary: v.summary ?? null,
              isKev: v.isKev ?? false,
              epssScore: v.epssScore ?? null,
              epssPercentile: v.epssPercentile ?? null,
            },
          })
          await prisma.alertEvent.create({
            data: {
              alertId: alert.id,
              type: "detected",
              data: { cvssScore: v.cvssScore ?? null, severity: v.severity ?? null },
            },
          })
          newAlertsList.push({
            packageName: r.package,
            packageVersion: r.version,
            externalId,
            severity: v.severity ?? null,
            cvssScore: v.cvssScore ?? null,
          })
          newAlertCount++
        }
      }
    }

    // CPE packages: individual CPE search
    for (const p of cpePkgs) {
      const result = await searchByCPE(p.cpe!)
      for (const v of result.results) {
        const externalId = v.externalId || v.id
        const existing = await prisma.alert.findFirst({
          where: { assetId, packageName: p.name, packageVersion: p.version, ecosystem: "", externalId },
          select: { id: true },
        })
        if (existing) continue

        const alert = await prisma.alert.create({
          data: {
            assetId,
            packageName: p.name,
            packageVersion: p.version,
            ecosystem: "",
            externalId,
            sources: v.sources?.length ? v.sources : [v.source || "nvd"],
            cvssScore: v.cvssScore ?? null,
            cvssVector: v.cvssVector ?? null,
            severity: v.severity ?? null,
            summary: v.summary ?? null,
            isKev: v.isKev ?? false,
            epssScore: v.epssScore ?? null,
            epssPercentile: v.epssPercentile ?? null,
          },
        })
        await prisma.alertEvent.create({
          data: {
            alertId: alert.id,
            type: "detected",
            data: { cvssScore: v.cvssScore ?? null, severity: v.severity ?? null },
          },
        })
        newAlertsList.push({
          packageName: p.name,
          packageVersion: p.version,
          externalId,
          severity: v.severity ?? null,
          cvssScore: v.cvssScore ?? null,
        })
        newAlertCount++
      }
    }

    await prisma.scanJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date(), newAlerts: newAlertCount },
    })
    await prisma.asset.update({
      where: { id: assetId },
      data: { scannedAt: new Date() },
    })

    if (newAlertsList.length > 0) {
      const assetTagIds = asset.assetTags.map((at) => at.tagId)
      await notifySlackIfNeeded({
        assetName: asset.name || asset.hostname,
        assetTagIds,
        triggerType: "detected",
        alerts: newAlertsList,
      }).catch(() => {})
    }

    return NextResponse.json({ jobId: job.id, newAlerts: newAlertCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    await prisma.scanJob.update({
      where: { id: job.id },
      data: { status: "failed", completedAt: new Date(), errorMsg: msg },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
