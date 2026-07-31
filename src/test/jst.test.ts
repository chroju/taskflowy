import { describe, it, expect } from "vitest";
import { jstDateString, jstHour, jstDateTimeFromParts } from "../api/jst";

describe("jstDateString", () => {
  it("converts a UTC instant to its JST calendar date (YYYY-MM-DD)", () => {
    // 2026-07-28T15:00:00Z = 2026-07-29T00:00:00+09:00
    const now = new Date("2026-07-28T15:00:00Z");
    expect(jstDateString(now)).toBe("2026-07-29");
  });

  it("stays on the same day when JST offset does not cross midnight", () => {
    // 2026-07-28T01:00:00Z = 2026-07-28T10:00:00+09:00
    const now = new Date("2026-07-28T01:00:00Z");
    expect(jstDateString(now)).toBe("2026-07-28");
  });
});

describe("jstHour", () => {
  it("returns the JST hour (0-23)", () => {
    // 2026-07-28T00:30:00Z = 2026-07-28T09:30:00+09:00
    const now = new Date("2026-07-28T00:30:00Z");
    expect(jstHour(now)).toBe(9);
  });

  it("wraps correctly across midnight", () => {
    // 2026-07-28T15:30:00Z = 2026-07-29T00:30:00+09:00
    const now = new Date("2026-07-28T15:30:00Z");
    expect(jstHour(now)).toBe(0);
  });
});

describe("jstDateTimeFromParts", () => {
  it("builds a UTC Date instant from a JST date+time", () => {
    // 2026-07-28 14:30 JST = 2026-07-28T05:30:00Z
    const d = jstDateTimeFromParts("2026-07-28", "14:30");
    expect(d.toISOString()).toBe("2026-07-28T05:30:00.000Z");
  });

  it("handles times that push the UTC instant into the previous day", () => {
    // 2026-07-28 05:00 JST = 2026-07-27T20:00:00Z
    const d = jstDateTimeFromParts("2026-07-28", "05:00");
    expect(d.toISOString()).toBe("2026-07-27T20:00:00.000Z");
  });
});
