/**
 * The password rule for user accounts. Client-safe.
 *
 * bcrypt reads at most 72 bytes and ignores the rest, so a longer password
 * would be accepted with anything after its 72nd byte; it is refused instead.
 */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_BYTES = 72

/** What is wrong with `password`, or null when it is acceptable. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required"
  if ([...password].length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes`
  }
  return null
}
