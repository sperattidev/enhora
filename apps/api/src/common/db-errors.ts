const UNIQUE_VIOLATION = '23505';

/** True for a Postgres unique-constraint violation, however drizzle wrapped the driver error. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}
