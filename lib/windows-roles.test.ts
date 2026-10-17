import { describe, it, expect } from "vitest"
import { isWindowsServerOs, roleNotInstalled, roleNotInstalledNote, rolesNotInstalled, WINDOWS_FEATURE_ROLES, WINDOWS_ROLES } from "./windows-roles"

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

describe("isWindowsServerOs", () => {
  it("recognises the OS package by MSRC's product name in the advisory ecosystem", () => {
    expect(isWindowsServerOs({ name: "Windows Server 2022", ecosystem: "advisory" })).toBe(true)
    expect(isWindowsServerOs({ name: "Windows Server 2019 (Server Core installation)", ecosystem: "advisory" })).toBe(true)
  })

  it("is false for anything else", () => {
    expect(isWindowsServerOs({ name: "Windows Server 2022", ecosystem: "" })).toBe(false)
    expect(isWindowsServerOs({ name: "Windows Server 2012 R2", ecosystem: "advisory" })).toBe(false)
    expect(isWindowsServerOs({ name: "FortiOS", ecosystem: "advisory" })).toBe(false)
  })
})

describe("rolesNotInstalled", () => {
  it("lists every role when no role feature is installed", () => {
    expect(rolesNotInstalled(["NetFx4", "Server-Gui-Mgmt"])).toEqual([...WINDOWS_ROLES])
    expect(WINDOWS_ROLES).toHaveLength(11)
  })

  it("leaves out a role when any one of its features is installed", () => {
    const notInstalled = rolesNotInstalled(["NetFx4", "DHCPServer", "RasRoutingProtocols"])
    expect(notInstalled).not.toContain("DHCP Server")
    expect(notInstalled).not.toContain("Routing and Remote Access (RRAS)")
    expect(notInstalled).toContain("DNS Server")
    expect(notInstalled).toHaveLength(9)
  })

  it("labels the features by role, sharing one label for the two RRAS features", () => {
    expect(WINDOWS_FEATURE_ROLES["RemoteAccessServer"]).toBe(WINDOWS_FEATURE_ROLES["RasRoutingProtocols"])
    expect(WINDOWS_FEATURE_ROLES["NetFx4"]).toBeUndefined()
  })
})
