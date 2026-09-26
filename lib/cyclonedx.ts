import { buildPURL, OS_PURL_TYPES, parsePURL } from "@/lib/purl"

export type CycloneDXComponent = {
  "bom-ref"?: string
  type?: string
  name?: string
  version?: string
  description?: string
  purl?: string
  scope?: string
  properties?: { name: string; value: string }[]
}

type CycloneDXDependency = {
  ref: string
  dependsOn?: string[]    // CycloneDX 1.6 field name
  dependencies?: string[] // fallback for older format
}

type CycloneDXTool = { vendor?: string; author?: string; name?: string; version?: string }

export type CycloneDXBom = {
  metadata?: {
    component?: { "bom-ref"?: string; name?: string; version?: string; type?: string; purl?: string }
    timestamp?: string
    // CycloneDX <1.5 (heretix-cli): a flat array. 1.5+ (Syft, Trivy, cdxgen): wrapped in `components`.
    tools?: CycloneDXTool[] | { components?: CycloneDXTool[] }
  }
  components?: CycloneDXComponent[]
  dependencies?: CycloneDXDependency[]
}

// bom.dependencies cross-references components by bom-ref, not purl — the two
// are usually identical (heretix-cli always sets bom-ref = purl), but a scanner
// is free to make them differ. Syft does exactly that to disambiguate same-purl
// components: bom-ref carries an internal "package-id" query param that purl
// doesn't, so joining on purl silently finds nothing and every package looks
// dependency-free.
function componentRef(c: { "bom-ref"?: string; purl?: string }): string | undefined {
  return c["bom-ref"] ?? c.purl
}

/**
 * CycloneDX component types that describe something other than an installed
 * package, and so must not become Package rows.
 *
 * Scanners put more than packages in `components`: Syft's container scan emits a
 * "file" entry per file in the image and an "operating-system" entry for the
 * distro itself, neither of which carries a purl. Left in, the file entries fill
 * the Packages tab with paths, and the operating-system entry — which does have a
 * version — gets sent to heretix-api as a package named e.g. "alpine", inviting
 * matches against something unrelated.
 *
 * An allowlist would be the wrong shape here: "library" covers most of what
 * scanners emit, but cdxgen also types entries as "framework", and a scanner is
 * free to use "application" for a packaged app. Excluding only what is definitely
 * not a package keeps an unfamiliar type from being silently dropped.
 */
const NON_PACKAGE_COMPONENT_TYPES = new Set([
  "file",
  "operating-system",
  "container",
  "device",
  "firmware",
  "platform",
  "device-driver",
  "machine-learning-model",
  "data",
  "cryptographic-asset",
])

function isPackageComponent(c: CycloneDXComponent): boolean {
  if (c.type && NON_PACKAGE_COMPONENT_TYPES.has(c.type)) return false
  // gpg-pubkey entries record an imported RPM signing key, not an installed
  // package — no real version, never in any advisory. Trivy and Syft both
  // list them; heretix-cli drops them at collection time.
  if (c.name === "gpg-pubkey" && c.purl?.startsWith("pkg:rpm/")) return false
  // No purl and no version is not something a vulnerability lookup can act on;
  // it is a component the scanner listed for provenance, not an installed package.
  return !!c.purl || !!c.version
}

function property(c: CycloneDXComponent, name: string): string | undefined {
  return c.properties?.find(p => p.name === name)?.value
}

// "openssl-3.0.7-24.el9.src.rpm" → "openssl": the name is everything before the
// last two hyphen-separated fields (version and release), which never contain one.
function sourceRpmName(sourceRpm: string): string | null {
  const parts = sourceRpm.replace(/\.src\.rpm$/, "").split("-")
  return parts.length > 2 ? parts.slice(0, -2).join("-") : null
}

/**
 * The upstream source package a binary OS package was split from (dpkg
 * Source:, rpm SourceRpm, apk o:) — used only to group sibling findings in the
 * Alerts table UI, never in alert identity or matching. Each scanner records it
 * under its own property namespace; heretix-cli also sets it to the package's
 * own name when there's no separate source package, and that's mirrored here
 * for OS packages so a SBOM's origin doesn't change how its alerts group.
 */
function sourcePackageOf(c: CycloneDXComponent, name: string, isOsPackage: boolean): string | null {
  const explicit =
    property(c, "heretix:source-package") ??
    property(c, "aquasecurity:trivy:SrcName") ??
    property(c, "syft:metadata:source") ??        // dpkg
    property(c, "syft:metadata:originPackage")    // apk
  if (explicit) return explicit
  const sourceRpm = property(c, "syft:metadata:sourceRpm")
  if (sourceRpm) return sourceRpmName(sourceRpm) ?? name
  return isOsPackage ? name : null
}

/**
 * Finds the packages the BOM's root depends on directly, for SBOMs without
 * heretix-cli's per-component `cdx:direct` property.
 *
 * Returns the direct set plus every package reachable from it, so the caller can
 * tell "indirect" (reachable, not direct) apart from "unknown" (not reached at
 * all). Scanners don't all hang packages directly off the root: Trivy inserts a
 * node per lockfile ("pnpm-lock.yaml", type application, no purl) and one for the
 * OS between the root and the packages. Lockfile nodes are walked through, since
 * a lockfile's own top-level entries are exactly the project's direct
 * dependencies.
 *
 * Two kinds of intermediate node are deliberately not walked through, leaving
 * their packages unclassified rather than guessed at:
 *  - the operating-system node — Trivy lists the OS packages nothing else
 *    depends on there, which says nothing about whether someone installed them
 *    on purpose (the same reasoning that leaves Syft's OS packages unclassified);
 *  - a node whose packages have no dependency edges of their own — Trivy's
 *    installed-package scans ("node-pkg", "python-pkg", ...) list every package
 *    found flat under one node, with no lockfile to say which were asked for.
 */
function classifyFromDependencyGraph(
  bom: CycloneDXBom,
  depsMap: Map<string, string[]>,
  componentsByRef: Map<string, CycloneDXComponent>,
): { direct: Set<string>; reachable: Set<string> } {
  const direct = new Set<string>()
  const reachable = new Set<string>()
  const rootRef = bom.metadata?.component ? componentRef(bom.metadata.component) : undefined
  if (!rootRef) return { direct, reachable }

  const isPackageRef = (ref: string) => {
    const c = componentsByRef.get(ref)
    return !!c && isPackageComponent(c)
  }

  const visitedNodes = new Set<string>([rootRef])
  const collectDirect = (nodeRef: string) => {
    const children = depsMap.get(nodeRef) ?? []
    const packageChildren = children.filter(isPackageRef)
    const hasGraph = nodeRef === rootRef || packageChildren.some(ref => (depsMap.get(ref)?.length ?? 0) > 0)
    if (hasGraph) for (const ref of packageChildren) direct.add(ref)
    for (const ref of children) {
      if (isPackageRef(ref) || visitedNodes.has(ref)) continue
      visitedNodes.add(ref)
      if (componentsByRef.get(ref)?.type === "operating-system") continue
      collectDirect(ref)
    }
  }
  collectDirect(rootRef)

  const queue = [...direct]
  while (queue.length) {
    const ref = queue.pop()!
    if (reachable.has(ref)) continue
    reachable.add(ref)
    for (const dep of depsMap.get(ref) ?? []) if (isPackageRef(dep)) queue.push(dep)
  }
  return { direct, reachable }
}

// Returns "name version" (or just "name") for the first tool listed in
// metadata.tools, in whichever of the two CycloneDX shapes it comes in.
function extractSbomTool(bom: CycloneDXBom): string | null {
  const tools = bom.metadata?.tools
  if (!tools) return null
  const list = Array.isArray(tools) ? tools : (tools.components ?? [])
  const name = list[0]?.name
  if (!name) return null
  const version = list[0]?.version
  return version ? `${name} ${version}` : name
}

/**
 * Converts a CycloneDX SBOM (heretix-cli, Syft, Trivy, cdxgen) into the
 * inventory.json shape the asset import path consumes.
 */
export function convertCycloneDXToInventory(bom: CycloneDXBom) {
  const components = bom.components ?? []

  // An empty name needs the same fallback as a missing one, since hostname is @unique.
  const hostname = bom.metadata?.component?.name?.trim() || "unknown"

  // Prefer an explicit "operating-system" component (Syft, Trivy, and cdxgen all
  // emit one) for OS info. metadata.component.version describes the scanned
  // artifact itself, not its OS — e.g. Syft sets it to a Bitnami image's own
  // version ("10" for bitnami/drupal:10), which isn't the OS at all. heretix-cli's
  // own SBOMs are the exception: they carry no operating-system component and put
  // the OS name in metadata.component.version instead, so that's the fallback.
  const osComponent = components.find(c => c.type === "operating-system")
  const osId = osComponent?.name ?? ""
  const osVersionId = osComponent?.version ?? ""
  const osName = osComponent
    ? (osComponent.description || `${osComponent.name ?? ""} ${osComponent.version ?? ""}`.trim())
    : (bom.metadata?.component?.version ?? "")
  // For an OS package whose purl has no distro qualifier, the operating-system
  // component still says which distro the whole SBOM describes.
  const fallbackDistro = osId && osVersionId ? `${osId}-${osVersionId}` : undefined

  // Build a ref → deps map from the bom.dependencies section.
  // CycloneDX 1.6 uses "dependsOn"; older tooling may use "dependencies".
  const depsMap = new Map<string, string[]>()
  for (const dep of bom.dependencies ?? []) {
    const depList = dep.dependsOn ?? dep.dependencies ?? []
    if (dep.ref && depList.length) {
      depsMap.set(dep.ref, depList)
    }
  }

  const componentsByRef = new Map<string, CycloneDXComponent>()
  for (const c of components) {
    const ref = componentRef(c)
    if (ref) componentsByRef.set(ref, c)
  }

  // dependsOn entries are refs too, so resolve each one back to a normalized,
  // qualifier-free PURL — built the same way (buildPURL) the dependency graph
  // reconstructs one from a Package row's name/version/ecosystem. The
  // component's own raw purl won't do: OS packages carry distro/arch/upstream
  // qualifiers Package rows don't store, so a raw-purl match would silently
  // fail there exactly like the unresolved ref did.
  const refToPurl = new Map<string, string>()
  for (const c of components) {
    const ref = componentRef(c)
    if (!ref || !c.purl) continue
    const parsed = parsePURL(c.purl, fallbackDistro)
    if (!parsed) continue
    refToPurl.set(ref, buildPURL(parsed.name, c.version ?? "", parsed.ecosystem))
  }

  // Fallback when the cdx:direct property is absent (SBOMs from Syft, Trivy, cdxgen, etc.)
  const graph = classifyFromDependencyGraph(bom, depsMap, componentsByRef)

  const seenPackageKeys = new Set<string>()
  const packages = components.filter(isPackageComponent).map(c => {
    const parsed = c.purl ? parsePURL(c.purl, fallbackDistro) : null
    const ecosystem = parsed?.ecosystem ?? "unknown"
    const name = parsed?.name ?? c.name ?? ""
    const ref = componentRef(c)
    const directProp = property(c, "cdx:direct")
    let direct: boolean | null
    if (directProp) {
      direct = directProp === "true"
    } else if (ref && graph.direct.has(ref)) {
      direct = true
    } else if (ref && graph.reachable.has(ref)) {
      direct = false
    } else {
      direct = null
    }
    const deps = ref
      ? (depsMap.get(ref) ?? []).map(depRef => refToPurl.get(depRef) ?? depRef)
      : []
    // heretix-cli marks a kernel-header or build-toolchain OS package with
    // this property (and mirrors it into scope=excluded, same as an npm dev
    // dependency) — kept distinct from scope so the UI can tell "not shipped
    // to production" (dev-only) apart from "shipped, but never executed"
    // (kernel/build), rather than showing both as one generic "Dev-only".
    const category = property(c, "heretix:category") ?? null
    const isOsPackage = !!parsed && OS_PURL_TYPES.has(parsed.type)
    return {
      name,
      version: c.version ?? "",
      rawVersion: c.version ?? "",
      ecosystem,
      source: "sbom",
      location: null,
      direct,
      deps,
      scope: c.scope === "excluded" ? "excluded" : null,
      category,
      sourcePackage: sourcePackageOf(c, name, isOsPackage),
    }
  }).filter(p => p.name !== "").filter(p => {
    // Some scanners (Syft on Bitnami images, for one) report the same package
    // twice — via different catalogers — with byte-identical purls. Package
    // rows are unique per (assetId, name, version, ecosystem), so an
    // unfiltered duplicate breaks the nested create on a brand-new asset,
    // while an existing asset's diff silently absorbs it (incoming packages
    // are keyed through a Map there). Dedupe here so both paths agree.
    const key = `${p.ecosystem}::${p.name}::${p.version}`
    if (seenPackageKeys.has(key)) return false
    seenPackageKeys.add(key)
    return true
  })

  const type = bom.metadata?.component?.type === "container" ? "docker_image" : "host"

  return {
    version: "1.0",
    hostname,
    type,
    scannedAt: bom.metadata?.timestamp ?? new Date().toISOString(),
    os: { id: osId, versionId: osVersionId, name: osName },
    sbomTool: extractSbomTool(bom),
    packages,
  }
}
