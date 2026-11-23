import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { AUDIT_ACTION_LABELS, auditActionLabel } from "./audit-actions"

describe("auditActionLabel", () => {
  it("uses the label of a known action", () => {
    expect(auditActionLabel("login_failed")).toBe("Login Failed")
    expect(auditActionLabel("history_purged")).toBe("History Purged")
  })

  it("puts an unknown action into words instead of hiding it", () => {
    expect(auditActionLabel("report_generated")).toBe("Report Generated")
    expect(auditActionLabel("x")).toBe("X")
  })
})

// The Action filter once lacked eight of the actions the code writes. Every action written
// through createAuditLog with a literal name has to be in the list.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe("AUDIT_ACTION_LABELS", () => {
  it("names every action the code writes to the audit log", () => {
    const written = new Set<string>()
    for (const dir of ["app", "lib"]) {
      for (const file of sourceFiles(join(process.cwd(), dir))) {
        const text = readFileSync(file, "utf8")
        for (let at = text.indexOf("createAuditLog("); at !== -1; at = text.indexOf("createAuditLog(", at + 1)) {
          const m = /action:\s*"([a-z_]+)"/.exec(text.slice(at, at + 500))
          if (m) written.add(m[1])
        }
      }
    }
    expect(written.size).toBeGreaterThan(15)
    expect([...written].filter((a) => !(a in AUDIT_ACTION_LABELS))).toEqual([])
  })
})
