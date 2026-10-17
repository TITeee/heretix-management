import { describe, it, expect } from "vitest"
import { roleNotInstalled, roleNotInstalledNote } from "./windows-roles"

describe("roleNotInstalled", () => {
  const installed = ["NetFx4", "Server-Gui-Mgmt", "DHCPServer"]

  it("sets aside a finding none of whose features is installed", () => {
    expect(roleNotInstalled(["DNS-Server-Full-Role"], installed)).toBe(true)
  })

  it("keeps a finding when any one of its features is installed", () => {
    expect(roleNotInstalled(["DHCPServer"], installed)).toBe(false)
    expect(roleNotInstalled(["RemoteAccessServer", "DHCPServer"], installed)).toBe(false)
  })

  it("keeps a finding that names no role, or when the installed features are unknown", () => {
    expect(roleNotInstalled(undefined, installed)).toBe(false)
    expect(roleNotInstalled([], installed)).toBe(false)
    expect(roleNotInstalled(["DNS-Server-Full-Role"], [])).toBe(false)
  })
})

describe("roleNotInstalledNote", () => {
  it("names the features the finding needs", () => {
    expect(roleNotInstalledNote(["RemoteAccessServer", "RasRoutingProtocols"])).toBe(
      "Role not installed on the server (needs RemoteAccessServer or RasRoutingProtocols)"
    )
  })
})
