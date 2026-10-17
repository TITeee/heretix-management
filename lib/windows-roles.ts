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
