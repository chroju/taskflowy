import { describe, it, expect } from "vitest";
import {
  parseRecurRule,
  nextOccurrence,
  addDaysStr,
  addRecurTag,
  removeRecurTag,
  hasRecurTag,
} from "../api/recur";

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

describe("recur note tag", () => {
  it("appends #recurring to an empty note", () => {
    expect(addRecurTag(null)).toBe("#recurring");
    expect(addRecurTag("")).toBe("#recurring");
  });

  it("appends #recurring on its own line after existing note text", () => {
    expect(addRecurTag("buy milk")).toBe("buy milk\n#recurring");
    expect(addRecurTag("line1\nline2\n")).toBe("line1\nline2\n#recurring");
  });

  it("is idempotent when the tag is already present", () => {
    expect(addRecurTag("#recurring")).toBe("#recurring");
    expect(addRecurTag("note\n#recurring")).toBe("note\n#recurring");
  });

  it("does not treat prefixed tags as the marker", () => {
    expect(addRecurTag("#recurring-old")).toBe("#recurring-old\n#recurring");
  });

  it("removes the tag line and trailing whitespace", () => {
    expect(removeRecurTag("note\n#recurring")).toBe("note");
    expect(removeRecurTag("#recurring")).toBe("");
    expect(removeRecurTag("a\n#recurring\nb")).toBe("a\nb");
  });

  it("returns the note unchanged when there is no tag", () => {
    expect(removeRecurTag("just a note")).toBe("just a note");
    expect(removeRecurTag(null)).toBe("");
    expect(removeRecurTag("#recurring-old")).toBe("#recurring-old");
  });

  it("hasRecurTag matches only a tag line of its own", () => {
    expect(hasRecurTag("note\n#recurring")).toBe(true);
    expect(hasRecurTag("#recurring")).toBe(true);
    expect(hasRecurTag("#recurring-old")).toBe(false);
    expect(hasRecurTag(null)).toBe(false);
  });
});
