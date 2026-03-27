import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { searchVulnerabilities, getVulnerabilityById, searchByCPE, HeretixApiError } from "@/lib/heretix-api"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  // CVE / OSV ID lookup mode
  if (id) {
    try {
      const data = await getVulnerabilityById(id.trim())
      if (!data) return NextResponse.json({ results: [] })
      // /vulnerabilities/:id returns a raw Prisma model, so normalize it to VulnerabilityResult format
      const normalized = {
        id: data.id,
        externalId: data.externalId ?? data.cveId ?? data.osvId ?? data.advisoryId ?? id.trim(),
        source: data.source ?? (data.cveId ? "nvd" : data.osvId ? "osv" : "advisory"),
        sources: data.sources ?? [],
        severity: data.severity ?? null,
        cvssScore: data.cvssScore ?? null,
        cvssVector: data.cvssVector ?? null,
        summary: data.summary ?? null,
        publishedAt: data.publishedAt ?? null,
        approximateMatch: false,
        isKev: data.isKev ?? false,
        epssScore: data.epssScore ?? null,
        epssPercentile: data.epssPercentile ?? null,
        nvdVulnerability: data.nvdVulnerability ?? null,
        osvVulnerabilities: data.osvVulnerabilities ?? [],
        advisoryVulnerabilities: data.advisoryVulnerabilities ?? [],
      }
      return NextResponse.json({ results: [normalized] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lookup failed"
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  }

  // CPE search mode
  const cpe = searchParams.get("cpe")
  if (cpe) {
    try {
      const data = await searchByCPE(cpe.trim())
      return NextResponse.json(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "CPE search failed"
      const status = err instanceof HeretixApiError && err.status < 500 ? err.status : 502
      return NextResponse.json({ error: msg }, { status })
    }
  }

  // Package search mode
  const pkg = searchParams.get("package")
  if (!pkg) return NextResponse.json({ error: "package, id, or cpe is required" }, { status: 400 })

  try {
    const data = await searchVulnerabilities({
      package: pkg,
      version: searchParams.get("version") ?? undefined,
      ecosystem: searchParams.get("ecosystem") ?? undefined,
    })
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
