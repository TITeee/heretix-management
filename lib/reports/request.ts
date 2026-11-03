import { formatDay, lastDay, parsePeriod, presetPeriod, type PeriodPreset, type ReportPeriod } from "./period"

/**
 * The executive report's conditions as URL parameters, read the same way by the page and the
 * API route, so a report's URL and its CSV always cover the same thing:
 *
 *   period  last_month (the default), last_3_months or custom
 *   from    custom only: the first day, YYYY-MM-DD
 *   to      custom only: the last day, included
 *   tags    asset tag IDs, comma-separated: the report covers the assets carrying any of them;
 *           left out or empty, every asset
 */

export type PeriodChoice = PeriodPreset | "custom"

export type ReportRequest = {
  choice: PeriodChoice
  period: ReportPeriod
  /** Empty: every asset. */
  tagIds: string[]
}

const PRESETS: PeriodPreset[] = ["last_month", "last_3_months"]

type Params = { get(name: string): string | null }

export function parseReportRequest(params: Params, now: Date = new Date()): ReportRequest | { error: string } {
  const choice = params.get("period") ?? "last_month"
  let period: ReportPeriod
  if (choice === "custom") {
    const parsed = parsePeriod(params.get("from") ?? "", params.get("to") ?? "")
    if ("error" in parsed) return parsed
    period = parsed
  } else if ((PRESETS as string[]).includes(choice)) {
    period = presetPeriod(choice as PeriodPreset, now)
  } else {
    return { error: `Unknown period: ${choice}` }
  }
  const tagIds = (params.get("tags") ?? "").split(",").filter((id) => id !== "")
  return { choice: choice as PeriodChoice, period, tagIds }
}

/** The URL parameters of a request, as parseReportRequest reads them back. */
export function reportSearchParams(request: ReportRequest): URLSearchParams {
  const params = new URLSearchParams({ period: request.choice })
  if (request.choice === "custom") {
    params.set("from", formatDay(request.period.from))
    params.set("to", formatDay(lastDay(request.period)))
  }
  if (request.tagIds.length > 0) params.set("tags", request.tagIds.join(","))
  return params
}
