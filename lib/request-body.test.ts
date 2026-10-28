import { describe, it, expect, afterEach } from "vitest"
import { BodyTooLargeError, importBodyMaxBytes, readJsonBody, stringList } from "./request-body"

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers, duplex: "half" } as RequestInit)

// A body sent in pieces with no Content-Length, as a chunked upload is.
function streamed(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s))
      c.close()
    },
  })
}

describe("readJsonBody", () => {
  it("parses a body within the limit", async () => {
    await expect(readJsonBody(post('{"a":1}'), 100)).resolves.toEqual({ a: 1 })
  })

  it("refuses a body whose Content-Length is over the limit, before reading it", async () => {
    await expect(readJsonBody(post('{"a":1}', { "content-length": "101" }), 100)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it("refuses a body without a Content-Length once what was read passes the limit", async () => {
    const req = post(streamed(['{"a":"', "x".repeat(80), "x".repeat(80), '"}']))
    expect(req.headers.get("content-length")).toBeNull()
    await expect(readJsonBody(req, 100)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it("throws a SyntaxError for what is not JSON, as req.json() did", async () => {
    await expect(readJsonBody(post("{"), 100)).rejects.toBeInstanceOf(SyntaxError)
  })
})

describe("importBodyMaxBytes", () => {
  afterEach(() => { delete process.env.MAX_IMPORT_BODY_MB })

  it("is 50 MB unless MAX_IMPORT_BODY_MB says otherwise", () => {
    expect(importBodyMaxBytes()).toBe(50 * 1024 * 1024)
    process.env.MAX_IMPORT_BODY_MB = "200"
    expect(importBodyMaxBytes()).toBe(200 * 1024 * 1024)
    process.env.MAX_IMPORT_BODY_MB = "nonsense"
    expect(importBodyMaxBytes()).toBe(50 * 1024 * 1024)
  })
})

describe("stringList", () => {
  it("trims entries and drops blanks and duplicates", () => {
    expect(stringList([" a ", "b", "", "a", "  "])).toEqual(["a", "b"])
  })

  it("rejects anything that isn't a non-empty array of strings", () => {
    expect(stringList(undefined)).toBeNull()
    expect(stringList("a")).toBeNull()
    expect(stringList([])).toBeNull()
    expect(stringList(["", " "])).toBeNull()
    expect(stringList(["a", 1])).toBeNull()
  })
})
