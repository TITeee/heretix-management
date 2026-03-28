const log = (level: string, msg: string, data?: object) =>
  (level === "error" ? console.error : console.log)(
    JSON.stringify({ level, msg, ...data, ts: new Date().toISOString() })
  )

export const logger = {
  info:  (msg: string, data?: object) => log("info",  msg, data),
  warn:  (msg: string, data?: object) => log("warn",  msg, data),
  error: (msg: string, data?: object) => log("error", msg, data),
}
