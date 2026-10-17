/**
 * Findings in a Windows Server role the server does not run.
 *
 * Microsoft lists the CVEs of optional server roles (DNS Server, DHCP Server,
 * AD FS, ...) under the OS product itself, so heretix-api reports them for
 * every server. It names the Windows optional features any one of which puts
 * the vulnerable code on the server (requiresFeatures), and heretix-cli
 * reports the features a server has installed (Package.windowsFeatures). A
 * finding whose features are all missing is not affected: its alert is
 * ignored as not_affected, code_not_present, by the scan, which reopens it if
 * the role is installed later.
 */

/** The VEX justification of a finding in a role the server does not run. */
export const ROLE_NOT_INSTALLED_JUSTIFICATION = "code_not_present"

/**
 * Whether the server lacks every feature the finding needs. False when the
 * finding names none (it applies to every server) or when the installed
 * features are unknown (an empty list): only a known absence sets it aside.
 */
export function roleNotInstalled(requiresFeatures: string[] | null | undefined, installedFeatures: string[]): boolean {
  if (!requiresFeatures?.length || installedFeatures.length === 0) return false
  return !requiresFeatures.some((f) => installedFeatures.includes(f))
}

/** The timeline note for an alert set aside this way. */
export function roleNotInstalledNote(requiresFeatures: string[]): string {
  return `Role not installed on the server (needs ${requiresFeatures.join(" or ")})`
}

/**
 * Whether a package is the Windows Server OS itself, as heretix-cli reports
 * it (or as one is added by hand under Advisory): MSRC's product name in the
 * advisory ecosystem. Only that package can carry the installed features.
 */
export function isWindowsServerOs(pkg: { name: string; ecosystem: string }): boolean {
  return pkg.ecosystem === "advisory" && /^Windows Server (2016|2019|2022|2025)( \(Server Core installation\))?$/.test(pkg.name)
}

/**
 * The server role each optional feature installs, for the features heretix-api
 * judges findings by (its config/windows-role-features.ts is the authority,
 * and decides what a finding needs through requiresFeatures). This table only
 * labels the installed-features list; if it falls behind, a feature loses its
 * role label and no finding is judged differently.
 */
export const WINDOWS_FEATURE_ROLES: Readonly<Record<string, string>> = {
  "DNS-Server-Full-Role": "DNS Server",
  "DHCPServer": "DHCP Server",
  "RemoteAccessServer": "Routing and Remote Access (RRAS)",
  "RasRoutingProtocols": "Routing and Remote Access (RRAS)",
  "IdentityServer-SecurityTokenService": "AD FS",
  "NPAS-Role": "Network Policy Server (NPS)",
  "MSMQ-Server": "Message Queuing",
  "Gateway": "Remote Desktop Gateway",
  "UpdateServices-Services": "WSUS",
  "IIS-WebServer": "IIS",
  "ADCertificateServicesRole": "AD CS",
  "Microsoft-Windows-Deployment-Services": "Windows Deployment Services",
}

/** The roles a finding can be judged by, in the order above, each once. */
export const WINDOWS_ROLES: readonly string[] = [...new Set(Object.values(WINDOWS_FEATURE_ROLES))]

/**
 * The roles that none of the installed features installs: the roles whose
 * findings the scan sets aside on this server. A role counts as installed
 * when any one of its features is.
 */
export function rolesNotInstalled(installedFeatures: string[]): string[] {
  const installed = new Set(installedFeatures.map((f) => WINDOWS_FEATURE_ROLES[f]).filter(Boolean))
  return WINDOWS_ROLES.filter((r) => !installed.has(r))
}
