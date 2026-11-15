/**
 * Scans take turns. Each one holds about 1.2 to 1.5 GB at its peak (a host with tens of
 * thousands of new alerts) and one of heretix-api's batch-search slots, of which it has two
 * for every client. Scans started together (twenty CI uploads with ?scan=true, Run Scan on a
 * few assets, the scheduled scan) used to run side by side: heretix-api answered most of them
 * 429, the waiting ones retried together into its per-minute limit, and 12 of 20 failed. In
 * turn, they all succeed, and the other slot stays free for heretix-cli.
 */
import { logger } from "@/lib/logger"

export function scanConcurrency(env: string | undefined = process.env.SCAN_CONCURRENCY): number {
  const n = Number(env)
  return env !== undefined && env.trim() !== "" && Number.isInteger(n) && n >= 1 ? n : 1
}

export type Limiter = {
  run<T>(task: () => Promise<T>): Promise<T>
  readonly running: number
  readonly waiting: number
}

/** At most `limit` tasks at once; the rest wait their turn, first come first served. */
export function createLimiter(limit: number, onWait?: (waiting: number) => void): Limiter {
  let running = 0
  const queue: (() => void)[] = []
  const next = () => {
    if (running >= limit) return
    const start = queue.shift()
    if (start) { running++; start() }
  }
  return {
    get running() { return running },
    get waiting() { return queue.length },
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          task().then(resolve, reject).finally(() => { running--; next() })
        })
        if (running >= limit) onWait?.(queue.length)
        next()
      })
    },
  }
}

export const scanQueue = createLimiter(scanConcurrency(), (waiting) => {
  logger.info("scan waiting for its turn", { waiting, concurrency: scanConcurrency() })
})
