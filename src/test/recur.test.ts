import { describe, it, expect } from "vitest";
import { parseRecurRule, nextOccurrence, addDaysStr } from "../api/recur";

describe("parseRecurRule", () => {
  it("accepts a daily rule", () => {
    expect(parseRecurRule({ freq: "daily" })).toEqual({ freq: "daily" });
  });

  it("accepts a weekly rule with weekday 0-6", () => {
    expect(parseRecurRule({ freq: "weekly", weekday: 0 })).toEqual({ freq: "weekly", weekday: 0 });
    expect(parseRecurRule({ freq: "weekly", weekday: 6 })).toEqual({ freq: "weekly", weekday: 6 });
  });

  it("accepts a monthly rule with day 1-31", () => {
    expect(parseRecurRule({ freq: "monthly", day: 1 })).toEqual({ freq: "monthly", day: 1 });
    expect(parseRecurRule({ freq: "monthly", day: 31 })).toEqual({ freq: "monthly", day: 31 });
  });

  it("rejects invalid shapes", () => {
    expect(parseRecurRule(null)).toBeNull();
    expect(parseRecurRule("daily")).toBeNull();
    expect(parseRecurRule({ freq: "yearly" })).toBeNull();
    expect(parseRecurRule({ freq: "weekly" })).toBeNull();
    expect(parseRecurRule({ freq: "weekly", weekday: 7 })).toBeNull();
    expect(parseRecurRule({ freq: "weekly", weekday: -1 })).toBeNull();
    expect(parseRecurRule({ freq: "weekly", weekday: 1.5 })).toBeNull();
    expect(parseRecurRule({ freq: "monthly" })).toBeNull();
    expect(parseRecurRule({ freq: "monthly", day: 0 })).toBeNull();
    expect(parseRecurRule({ freq: "monthly", day: 32 })).toBeNull();
  });

  it("drops extra properties", () => {
    expect(parseRecurRule({ freq: "daily", weekday: 3 })).toEqual({ freq: "daily" });
  });
});

describe("nextOccurrence", () => {
  it("daily: returns the next day", () => {
    expect(nextOccurrence({ freq: "daily" }, "2026-08-09")).toBe("2026-08-10");
    expect(nextOccurrence({ freq: "daily" }, "2026-12-31")).toBe("2027-01-01");
  });

  it("weekly: returns the next matching weekday strictly after the date", () => {
    // 2026-08-09 is a Sunday
    expect(nextOccurrence({ freq: "weekly", weekday: 1 }, "2026-08-09")).toBe("2026-08-10");
    expect(nextOccurrence({ freq: "weekly", weekday: 6 }, "2026-08-09")).toBe("2026-08-15");
    // Same weekday -> one full week later, never the same day
    expect(nextOccurrence({ freq: "weekly", weekday: 0 }, "2026-08-09")).toBe("2026-08-16");
  });

  it("monthly: returns the day in the current month when still ahead", () => {
    expect(nextOccurrence({ freq: "monthly", day: 15 }, "2026-08-09")).toBe("2026-08-15");
  });

  it("monthly: moves to the next month when the day has passed or is today", () => {
    expect(nextOccurrence({ freq: "monthly", day: 9 }, "2026-08-09")).toBe("2026-09-09");
    expect(nextOccurrence({ freq: "monthly", day: 5 }, "2026-08-09")).toBe("2026-09-05");
    expect(nextOccurrence({ freq: "monthly", day: 3 }, "2026-12-10")).toBe("2027-01-03");
  });

  it("monthly: clamps to the last day of short months", () => {
    expect(nextOccurrence({ freq: "monthly", day: 31 }, "2026-08-31")).toBe("2026-09-30");
    expect(nextOccurrence({ freq: "monthly", day: 31 }, "2027-01-31")).toBe("2027-02-28");
    // 2028 is a leap year
    expect(nextOccurrence({ freq: "monthly", day: 30 }, "2028-01-31")).toBe("2028-02-29");
  });

  it("monthly: a clamped day still counts as this month's occurrence", () => {
    // day=31 in September resolves to 09-30, which is ahead of 09-15
    expect(nextOccurrence({ freq: "monthly", day: 31 }, "2026-09-15")).toBe("2026-09-30");
  });
});

describe("addDaysStr", () => {
  it("adds and subtracts calendar days across month boundaries", () => {
    expect(addDaysStr("2026-08-09", 1)).toBe("2026-08-10");
    expect(addDaysStr("2026-08-01", -1)).toBe("2026-07-31");
    expect(addDaysStr("2026-08-09", -90)).toBe("2026-05-11");
  });
});
