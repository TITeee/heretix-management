/**
 * The words of an alert's timeline: the headline of each event, as the alert
 * panel's Timeline tab shows it, and the same event as one line of text for an
 * export. Kept apart from the panel's icons so the server can use them too.
 * Client-safe.
 */
import { STATUS_LABELS } from "@/lib/severity"
import { epssChangeText } from "@/lib/epss-change"
import { IGNORE_REASONS, isIgnoreReason } from "@/lib/vex"

type EventData = Record<string, unknown>

/**
 * The headline of each event type. A type that is not listed is not shown: the
 * Timeline tab drops it, and so does the export.
 */
export const EVENT_LABELS: Record<string, (data: EventData) => string> = {
  detected: () => "Alert detected",
  status_changed: (data) => `Status changed to "${STATUS_LABELS[data.to as string] ?? data.to}"`,
  ignore_reason_changed: (data) => `Ignore reason changed: "${data.from}" to "${data.to}"`,
  // Emitted when an alert is carried over to a package whose version changed, and
  // when a finding starts being reported under a newly assigned CVE. Both move an
  // alert rather than replacing it, so the timeline is the only place the move is visible.
  package_changed: (data) => `Package changed: ${data.from} → ${data.to}`,
  identifier_changed: (data) => `Identifier changed: ${data.from} → ${data.to}`,
  kev_added: () => "Added to CISA KEV",
  cvss_changed: (data) => `CVSS score changed: ${data.from ?? "n/a"} → ${data.to ?? "n/a"}`,
  epss_changed: (data) => `EPSS updated: ${epssChangeText(data)}`,
  severity_changed: (data) => `Severity changed: ${data.from ?? "n/a"} → ${data.to ?? "n/a"}`,
  notes_saved: () => "Notes saved",
  vex_justification_set: () => "VEX justification set",
  vex_imported: (data) => `VEX imported — ${String(data.state)}`,
}

export type TimelineEvent = { type: string; data: unknown; createdAt: Date | string }

/** "2026-11-07 13:00 UTC": minutes are enough for a timeline, and the zone is said. */
export function formatEventTime(at: Date | string): string {
  const iso = new Date(at).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** Text on one line: runs of whitespace, newlines included, become one space. */
function oneLine(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim()
}

/**
 * One event as one line of text: when, the headline, then what the panel shows
 * under it (who did it, the ignore reason, the reason given, the notes saved).
 * Null for a type the timeline does not show.
 */
export function eventLine(event: TimelineEvent): string | null {
  const label = EVENT_LABELS[event.type]
  if (!label) return null
  const data = (event.data && typeof event.data === "object" ? event.data : {}) as EventData
  const parts = [`${formatEventTime(event.createdAt)} ${label(data)}`]
  if (data.userName) parts.push(`by ${oneLine(data.userName)}`)
  if (event.type === "status_changed") {
    if (isIgnoreReason(data.ignoreReason)) parts.push(IGNORE_REASONS[data.ignoreReason])
    if (data.reason) parts.push(oneLine(data.reason))
  }
  if (event.type === "notes_saved" && data.notes) parts.push(`notes: ${oneLine(data.notes)}`)
  return parts.join("; ")
}

/** An alert's timeline as text, oldest first, one event per line. */
export function timelineText(events: TimelineEvent[]): string {
  return [...events]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(eventLine)
    .filter((line): line is string => line !== null)
    .join("\n")
}
