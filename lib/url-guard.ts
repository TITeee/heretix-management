import dns from "node:dns/promises"
import net from "node:net"

// Deliberately narrow: this only blocks the cloud "instance metadata" address
// range (169.254.0.0/16 — reachable without authentication from AWS/GCP/
// Azure/etc. instances, and the classic SSRF-to-stolen-credentials path) and
// its IPv6 equivalents. Ordinary private/LAN addresses and localhost are
// allowed on purpose: heretix-api commonly runs on the same host or the same
// private network as this app (this deployment's own HERETIX_API_URL is
// http://localhost:5000), so blocking RFC1918/loopback would break that
// normal setup without meaningfully reducing risk — those targets aren't
// unauthenticated credential-dispensers the way the metadata service is.
function isLinkLocalOrMetadataAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number)
    return a === 169 && b === 254
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower.startsWith("fe80")) return true // link-local
    if (lower === "fd00:ec2::254") return true // AWS's IPv6 metadata alias
    if (lower.startsWith("::ffff:169.254.")) return true // IPv4-mapped
    return false
  }
  return false
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error("Invalid URL")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must use http or https")
  }
  const hostname = parsed.hostname
  if (net.isIP(hostname)) {
    if (isLinkLocalOrMetadataAddress(hostname)) {
      throw new Error("URL may not target a link-local/metadata address")
    }
    return
  }
  let addresses: string[]
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map((r) => r.address)
  } catch {
    throw new Error("Could not resolve hostname")
  }
  if (addresses.length === 0 || addresses.some(isLinkLocalOrMetadataAddress)) {
    throw new Error("URL may not resolve to a link-local/metadata address")
  }
}
