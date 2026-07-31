// JST (UTC+9, no DST) time helpers. Avoids Date's locale-dependent methods
// (toLocaleString, etc.) in favor of a fixed millisecond offset, so behavior
// does not depend on the runtime's configured timezone (Workers runs in UTC,
// but we don't want to rely on that assumption either).

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJstShifted(date: Date): Date {
  return new Date(date.getTime() + JST_OFFSET_MS);
}

// Calendar date in JST, formatted as YYYY-MM-DD.
export function jstDateString(date: Date): string {
  const shifted = toJstShifted(date);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Hour of day (0-23) in JST.
export function jstHour(date: Date): number {
  return toJstShifted(date).getUTCHours();
}

// Builds the UTC instant corresponding to a given JST date (YYYY-MM-DD) and
// time (HH:mm).
export function jstDateTimeFromParts(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const utcMs = Date.UTC(y, m - 1, d, h, min) - JST_OFFSET_MS;
  return new Date(utcMs);
}
