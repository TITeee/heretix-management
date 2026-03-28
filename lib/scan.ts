import { prisma } from "@/lib/db"
import { batchSearch, searchByCPE } from "@/lib/heretix-api"
import { notifySlackIfNeeded, type AlertSummary } from "@/lib/slack"

const BATCH_SIZE = 1000

export async function scanAsset(assetId: string): Promise<{ newAlerts: number }> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { packages: true, assetTags: true },
  })
  if (!asset) throw new Error(`Asset not found: ${assetId}`)

  const job = await prisma.scanJob.create({
    data: { assetId, status: "running", startedAt: new Date() },
  })

  try {
    const pkgs = asset.packages.filter(
      (p) => p.name.trim().length > 0 && p.version.trim().length > 0
    )

    const cpePkgs = pkgs.filter((p) => p.cpe && p.cpe.trim().length > 0)
    const normalPkgs = pkgs.filter((p) => !p.cpe || p.cpe.trim().length === 0)

    const chunks: typeof normalPkgs[] = []
    for (let i = 0; i < normalPkgs.length; i += BATCH_SIZE) {
      chunks.push(normalPkgs.slice(i, i + BATCH_SIZE))
    }

    let newAlertCount = 0
    const newAlertsList: AlertSummary[] = []

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

    return { newAlerts: newAlertCount }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    await prisma.scanJob.update({
      where: { id: job.id },
      data: { status: "failed", completedAt: new Date(), errorMsg: msg },
    })
    throw err
  }
}

export async function scanAllAssets(): Promise<void> {
  const assets = await prisma.asset.findMany({ select: { id: true } })
  for (const asset of assets) {
    try {
      await scanAsset(asset.id)
    } catch {
      // Continue scanning remaining assets even if one fails
    }
  }
}
