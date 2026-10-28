import { describe, it, expect } from "vitest"
import { clientIp } from "./client-ip"

const headers = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff })

describe("clientIp", () => {
  it("takes the address the proxy appended, not the one the client sent", () => {
    // The client sent "1.2.3.4"; the proxy in front appended the address it saw.
    expect(clientIp(headers("1.2.3.4, 203.0.113.9"))).toBe("203.0.113.9")
  })

  it("takes the one address Next.js sets from the socket", () => {
    expect(clientIp(headers("203.0.113.9"))).toBe("203.0.113.9")
  })

  it("says unknown without one", () => {
    expect(clientIp(headers())).toBe("unknown")
    expect(clientIp(headers(" , "))).toBe("unknown")
  })
})
