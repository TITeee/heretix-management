import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { logger } from "@/lib/logger"

// Most route handlers only ever returned NextResponse.json({error}, {status})
// for conditions they anticipated; anything unexpected (a malformed request
// body, a Prisma error, a bug) fell through to Next.js's own unhandled-error
// 500 page instead of the app's own {error} JSON shape. Wrapping a handler in
// this gives every route the same fallback behavior and logging without
// having to hand-write a try/catch in each one.
export function withApiErrorHandling<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (err) {
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          return NextResponse.json({ error: "Not found" }, { status: 404 })
        }
        if (err.code === "P2002") {
          return NextResponse.json({ error: "A record with these values already exists" }, { status: 409 })
        }
      }
      logger.warn(`${routeName} failed`, { error: err instanceof Error ? err.message : String(err) })
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
