// Recurrence rules for tasks (Issue #26). Workflowy has no native recurrence,
// so rules live in KV keyed by node id and completing a recurring task only
// rolls its due date forward (the Workflowy node is never completed).
//
// All date math is pure YYYY-MM-DD string arithmetic via Date.UTC, so results
// do not depend on the runtime timezone. "Today" is always supplied by the
// caller (the client sends its local date).

export type RecurRule =
  | { freq: "daily" }
  | { freq: "weekly"; weekday: number } // 0=Sun .. 6=Sat
  | { freq: "monthly"; day: number }; // 1..31, clamped to the month's length

// Validates API input into a canonical rule (extra properties dropped).
export function parseRecurRule(raw: unknown): RecurRule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { freq } = raw as { freq?: unknown };
  if (freq === "daily") return { freq: "daily" };
  if (freq === "weekly") {
    const { weekday } = raw as { weekday?: unknown };
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return null;
    }
    return { freq: "weekly", weekday };
  }
  if (freq === "monthly") {
    const { day } = raw as { day?: unknown };
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) {
      return null;
    }
    return { freq: "monthly", day };
  }
  return null;
}

function toUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const dt = toUtc(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// The rule's occurrence within a given month, with day-of-month clamped.
function monthlyOccurrence(year: number, month: number, day: number): string {
  const clamped = Math.min(day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

// Nearest occurrence strictly after `afterDate` (YYYY-MM-DD). Missed
// occurrences are skipped by construction: the result is always in the
// future relative to the supplied date.
export function nextOccurrence(rule: RecurRule, afterDate: string): string {
  if (rule.freq === "daily") return addDaysStr(afterDate, 1);
  if (rule.freq === "weekly") {
    const current = toUtc(afterDate).getUTCDay();
    let delta = (rule.weekday - current + 7) % 7;
    if (delta === 0) delta = 7;
    return addDaysStr(afterDate, delta);
  }
  const [y, m] = afterDate.split("-").map(Number);
  const thisMonth = monthlyOccurrence(y, m, rule.day);
  if (thisMonth > afterDate) return thisMonth;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return monthlyOccurrence(nextY, nextM, rule.day);
}
