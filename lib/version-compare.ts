/**
 * Orders fixed versions so a Remediation action can say which one to upgrade to.
 *
 * Version strings do not share one ordering: dpkg, rpm and semver differ on
 * exactly the cases that matter here (a "~" suffix, a pre-release, a distro
 * revision), so the flavor follows the ecosystem the finding came from.
 *
 *   deb      dpkg's algorithm (epoch:upstream-revision), used for Debian and Ubuntu
 *   rpm      rpmvercmp, used for the other OS ecosystems (Red Hat, Rocky, Alma, Alpine, ...)
 *   generic  language packages and products registered by hand: dotted numbers, then an
 *            optional pre-release (1.0.0-rc.1, 1.0rc1, 2.0b3) that sorts below the release
 *
 * Known gaps: Alpine's "_rc1" / "_p1" suffixes are read as plain tokens by the rpm rule,
 * and Maven qualifiers other than the pre-release words below sort as post-release.
 */

export type VersionFlavor = "deb" | "rpm" | "generic"

export function versionFlavor(ecosystem: string): VersionFlavor {
  if (ecosystem.startsWith("Debian:") || ecosystem.startsWith("Ubuntu:")) return "deb"
  return "rpm"
}

export function compareVersions(a: string, b: string, flavor: VersionFlavor = "generic"): number {
  const x = a.trim()
  const y = b.trim()
  if (flavor === "deb") return compareDeb(x, y)
  if (flavor === "rpm") return compareRpm(x, y)
  return compareGeneric(x, y)
}

/** The highest of the versions; null for an empty list. */
export function maxVersion(versions: string[], flavor: VersionFlavor = "generic"): string | null {
  let best: string | null = null
  for (const v of versions) {
    if (best === null || compareVersions(v, best, flavor) > 0) best = v
  }
  return best
}

function splitEpoch(v: string): [number, string] {
  const m = /^(\d+):(.*)$/.exec(v)
  return m ? [Number(m[1]), m[2]] : [0, v]
}

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9"
const isAlpha = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"))

// --- dpkg ----------------------------------------------------------------

function debOrder(c: string | undefined): number {
  if (c === undefined || isDigit(c)) return 0
  if (isAlpha(c)) return c.charCodeAt(0)
  if (c === "~") return -1
  return c.charCodeAt(0) + 256
}

function debPart(a: string, b: string): number {
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    while ((i < a.length && !isDigit(a[i])) || (j < b.length && !isDigit(b[j]))) {
      const d = debOrder(a[i]) - debOrder(b[j])
      if (d !== 0) return d
      i++
      j++
    }
    while (a[i] === "0") i++
    while (b[j] === "0") j++
    let firstDiff = 0
    while (isDigit(a[i]) && isDigit(b[j])) {
      if (firstDiff === 0) firstDiff = a.charCodeAt(i) - b.charCodeAt(j)
      i++
      j++
    }
    if (isDigit(a[i])) return 1
    if (isDigit(b[j])) return -1
    if (firstDiff !== 0) return firstDiff
  }
  return 0
}

function compareDeb(a: string, b: string): number {
  const [ea, ra] = splitEpoch(a)
  const [eb, rb] = splitEpoch(b)
  if (ea !== eb) return ea < eb ? -1 : 1
  const split = (v: string): [string, string] => {
    const i = v.lastIndexOf("-")
    return i === -1 ? [v, ""] : [v.slice(0, i), v.slice(i + 1)]
  }
  const [ua, va] = split(ra)
  const [ub, vb] = split(rb)
  const upstream = debPart(ua, ub)
  if (upstream !== 0) return Math.sign(upstream)
  return Math.sign(debPart(va, vb))
}

// --- rpm -----------------------------------------------------------------

const isRpmChar = (c: string | undefined) => isDigit(c) || isAlpha(c) || c === "~" || c === "^"

function compareRpm(a: string, b: string): number {
  const [ea, ra] = splitEpoch(a)
  const [eb, rb] = splitEpoch(b)
  if (ea !== eb) return ea < eb ? -1 : 1
  return rpmvercmp(ra, rb)
}

function rpmvercmp(a: string, b: string): number {
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    while (i < a.length && !isRpmChar(a[i])) i++
    while (j < b.length && !isRpmChar(b[j])) j++

    // "~" sorts before everything, even the end of the string.
    if (a[i] === "~" || b[j] === "~") {
      if (a[i] !== "~") return 1
      if (b[j] !== "~") return -1
      i++
      j++
      continue
    }
    // "^" sorts after the end of the string but before any other segment.
    if (a[i] === "^" || b[j] === "^") {
      if (i >= a.length) return -1
      if (j >= b.length) return 1
      if (a[i] !== "^") return 1
      if (b[j] !== "^") return -1
      i++
      j++
      continue
    }
    if (i >= a.length || j >= b.length) break

    const numeric = isDigit(a[i])
    const test = numeric ? isDigit : isAlpha
    let si = i
    let sj = j
    while (i < a.length && test(a[i])) i++
    while (j < b.length && test(b[j])) j++
    let segA = a.slice(si, i)
    let segB = b.slice(sj, j)
    // Segments of different kinds: the numeric one is newer.
    if (segB === "") return numeric ? 1 : -1
    if (numeric) {
      segA = segA.replace(/^0+/, "")
      segB = segB.replace(/^0+/, "")
      if (segA.length !== segB.length) return segA.length > segB.length ? 1 : -1
    }
    if (segA !== segB) return segA > segB ? 1 : -1
  }
  if (i >= a.length && j >= b.length) return 0
  return i < a.length ? 1 : -1
}

// --- generic (semver, PEP 440, appliance firmware) --------------------------

const PRE_RELEASE_RANK: Record<string, number> = {
  dev: 0, snapshot: 0, alpha: 1, a: 1, beta: 2, b: 2, preview: 3, pre: 3, rc: 4, c: 4,
}

type Parsed = { core: number[]; pre: string[] | null; post: string[] }

function parseGeneric(v: string): Parsed | null {
  const m = /^[vV]?(\d+(?:\.\d+)*)(.*)$/.exec(v.replace(/\+.*$/, ""))
  if (!m) return null
  const core = m[1].split(".").map(Number)
  const rest = m[2].replace(/^[-._]/, "")
  if (rest === "") return { core, pre: null, post: [] }
  const tokens = rest.match(/\d+|[A-Za-z]+/g) ?? []
  if (tokens[0] !== undefined && tokens[0].toLowerCase() in PRE_RELEASE_RANK) {
    return { core, pre: tokens, post: [] }
  }
  return { core, pre: null, post: tokens }
}

function compareTokens(a: string[], b: string[]): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = isDigit(x[0])
    const yn = isDigit(y[0])
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    } else if (xn !== yn) {
      return xn ? 1 : -1
    } else {
      const rx = PRE_RELEASE_RANK[x.toLowerCase()]
      const ry = PRE_RELEASE_RANK[y.toLowerCase()]
      if (rx !== undefined && ry !== undefined && rx !== ry) return rx < ry ? -1 : 1
      const lx = x.toLowerCase()
      const ly = y.toLowerCase()
      if (lx !== ly) return lx < ly ? -1 : 1
    }
  }
  return 0
}

function compareGeneric(a: string, b: string): number {
  const pa = parseGeneric(a)
  const pb = parseGeneric(b)
  // Not a dotted number at all: fall back to the rpm rule, which is total and stable.
  if (!pa || !pb) return rpmvercmp(a, b)

  const n = Math.max(pa.core.length, pb.core.length)
  for (let i = 0; i < n; i++) {
    const x = pa.core[i] ?? 0
    const y = pb.core[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  // A pre-release is below the release it leads up to.
  if (pa.pre && !pb.pre) return -1
  if (!pa.pre && pb.pre) return 1
  if (pa.pre && pb.pre) return compareTokens(pa.pre, pb.pre)
  return compareTokens(pa.post, pb.post)
}
