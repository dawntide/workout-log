/**
 * Normalize date-like values returned by database drivers and SQL aggregates.
 *
 * Drizzle column decoders cover direct timestamp columns, but raw expressions
 * such as `max(timestamp)` can still arrive as strings depending on the driver.
 * Keep that runtime boundary explicit instead of asserting `sql<Date>`.
 */
export function parseDatabaseDate(value: unknown): Date | null {
  if (value == null) return null;

  const parsed =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;

  if (!parsed || !Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

export function requireDatabaseDate(value: unknown, fieldName: string): Date {
  const parsed = parseDatabaseDate(value);
  if (!parsed) {
    throw new TypeError(`${fieldName} is not a valid database date`);
  }
  return parsed;
}
