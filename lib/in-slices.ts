/**
 * How many rows one bulk insert of a scan writes. Prisma builds the whole query for a
 * createMany before sending it, and for a host with tens of thousands of new alerts (an RHEL
 * kernel's) that took about 2.5 GB at once: one such scan used 3 GB, and a second in a row
 * ran the app out of its 2 GB heap. In slices of this size, the same 48,656 alerts peak at
 * about 1.2 GB and take as long.
 */
export const WRITE_SLICE = 250

/** Calls `write` with the rows in slices, one after the other. */
export async function writeInSlices<T>(
  rows: T[],
  write: (slice: T[]) => Promise<unknown>,
  size: number = WRITE_SLICE,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await write(rows.slice(i, i + size))
  }
}
