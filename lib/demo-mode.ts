import { NextResponse } from "next/server"

/**
 * DEMO_MODE=true runs heretix-management as the public demo (the heretix-demo
 * repository): sample assets scanned in advance, next to a heretix-api that holds
 * only the vulnerabilities those assets have. Anything that would bring in new
 * packages or ask heretix-api about them is turned off, since its answers would
 * look like real results but come from a fraction of the data: importing,
 * scanning, package changes, the metadata refresh and the scheduler.
 *
 * Triage stays on (statuses, comments, tags, VEX export, Settings), so a
 * visitor can try the workflow on the sample data.
 */
export function isDemoMode(env: string | undefined = process.env.DEMO_MODE): boolean {
  return env === "true"
}

export const DEMO_MODE_MESSAGE =
  "Turned off in the demo: it shows sample data, and its vulnerability database holds only what the sample assets need."

/** The response for an action the demo turns off, or null when it is not a demo. */
export function demoModeBlocked(env?: string): NextResponse | null {
  return isDemoMode(env) ? NextResponse.json({ error: DEMO_MODE_MESSAGE }, { status: 403 }) : null
}
