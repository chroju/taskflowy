import { describe, it, expect } from "vitest";
import {
  parseTimeMarkup,
  stripTimeMarkup,
  buildTimeMarkup,
  setTimeMarkup,
  replaceNameText,
} from "../api/time-markup";

describe("parseTimeMarkup", () => {
  it("parses a date-only time markup", () => {
    const name = 'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>';
    expect(parseTimeMarkup(name)).toEqual({ date: "2026-07-28", time: null });
  });

  it("parses a time markup with hour and minute", () => {
    const name =
      'Meeting <time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="30">Tue, Jul 28, 2026 at 2:30 PM</time>';
    expect(parseTimeMarkup(name)).toEqual({ date: "2026-07-28", time: "14:30" });
  });

  it("pads single-digit month/day/hour/minute", () => {
    const name = '<time startYear="2026" startMonth="1" startDay="5" startHour="9" startMinute="5">x</time>';
    expect(parseTimeMarkup(name)).toEqual({ date: "2026-01-05", time: "09:05" });
  });

  it("ignores end* attributes and only uses start*", () => {
    const name =
      '<time startYear="2026" startMonth="7" startDay="28" endYear="2026" endMonth="7" endDay="29">range</time>';
    expect(parseTimeMarkup(name)).toEqual({ date: "2026-07-28", time: null });
  });

  it("returns null when there is no time markup", () => {
    expect(parseTimeMarkup("Just a plain task")).toBeNull();
  });

  it("parses only the first time tag when multiple exist", () => {
    const name =
      '<time startYear="2026" startMonth="7" startDay="28">a</time> and <time startYear="2026" startMonth="8" startDay="1">b</time>';
    expect(parseTimeMarkup(name)).toEqual({ date: "2026-07-28", time: null });
  });
});

describe("stripTimeMarkup", () => {
  it("removes the time tag and trims surrounding whitespace", () => {
    const name = 'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>';
    expect(stripTimeMarkup(name)).toBe("Buy milk");
  });

  it("collapses extra whitespace left after removal", () => {
    const name = 'Buy milk   <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>   trailing';
    expect(stripTimeMarkup(name)).toBe("Buy milk trailing");
  });

  it("returns the original text unchanged when there is no markup", () => {
    expect(stripTimeMarkup("Just a plain task")).toBe("Just a plain task");
  });

  it("returns empty string when the name is only a time markup", () => {
    const name = '<time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>';
    expect(stripTimeMarkup(name)).toBe("");
  });
});

describe("buildTimeMarkup", () => {
  it("builds a date-only markup", () => {
    const result = buildTimeMarkup("2026-07-28");
    expect(result).toBe('<time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>');
  });

  it("builds a markup with time in 12-hour display format (PM)", () => {
    const result = buildTimeMarkup("2026-07-28", "14:30");
    expect(result).toBe(
      '<time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="30">Tue, Jul 28, 2026 at 2:30 PM</time>'
    );
  });

  it("builds a markup with time in 12-hour display format (AM)", () => {
    const result = buildTimeMarkup("2026-01-05", "09:05");
    expect(result).toBe(
      '<time startYear="2026" startMonth="1" startDay="5" startHour="9" startMinute="5">Mon, Jan 5, 2026 at 9:05 AM</time>'
    );
  });

  it("handles midnight (00:00) as 12:00 AM", () => {
    const result = buildTimeMarkup("2026-07-28", "00:00");
    expect(result).toContain("at 12:00 AM");
    expect(result).toContain('startHour="0"');
  });

  it("handles noon (12:00) as 12:00 PM", () => {
    const result = buildTimeMarkup("2026-07-28", "12:00");
    expect(result).toContain("at 12:00 PM");
    expect(result).toContain('startHour="12"');
  });
});

describe("setTimeMarkup", () => {
  it("appends markup when name has none", () => {
    const result = setTimeMarkup("Buy milk", "2026-07-28");
    expect(result).toBe('Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>');
  });

  it("replaces existing markup in place", () => {
    const name = 'Buy milk <time startYear="2026" startMonth="1" startDay="1">Thu, Jan 1, 2026</time>';
    const result = setTimeMarkup(name, "2026-07-28", "14:30");
    expect(result).toBe(
      'Buy milk <time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="30">Tue, Jul 28, 2026 at 2:30 PM</time>'
    );
  });

  it("appends markup with a leading space when name does not end with one", () => {
    const result = setTimeMarkup("Task", "2026-07-28");
    expect(result.startsWith("Task <time")).toBe(true);
  });
});

describe("replaceNameText", () => {
  it("replaces the text of a name that has no markup", () => {
    expect(replaceNameText("Buy milk", "Buy soy milk")).toBe("Buy soy milk");
  });

  it("keeps the existing time markup when the text changes", () => {
    const name = 'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>';
    expect(replaceNameText(name, "Buy soy milk")).toBe(
      'Buy soy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>'
    );
  });

  it("keeps the markup when the new text is empty", () => {
    const name = 'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>';
    expect(replaceNameText(name, "")).toBe(
      '<time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>'
    );
  });

  it("keeps markup that sits at the head of the name", () => {
    const name = '<time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time> Buy milk';
    expect(replaceNameText(name, "Buy soy milk")).toBe(
      'Buy soy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>'
    );
  });

  it("trims surrounding whitespace of the new text", () => {
    expect(replaceNameText("Buy milk", "  Buy soy milk  ")).toBe("Buy soy milk");
  });
});
