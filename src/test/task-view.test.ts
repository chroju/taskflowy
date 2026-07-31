import { describe, it, expect } from "vitest";

const {
  localDateString,
  addDays,
  nextMonday,
  formatDueBadge,
  formatCreatedAt,
  classifyDue,
  compareDue,
  groupByDue,
  groupByParent,
  groupByCreated,
  workflowyUrl,
  swipeDirection,
  resolveSwipeAction,
  scheduleShortcut,
} = await import("../../public/scripts/tasks.js");

describe("localDateString", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(localDateString(new Date(2026, 6, 28))).toBe("2026-07-28");
  });

  it("pads single-digit month and day", () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("addDays", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-07-28", 1)).toBe("2026-07-29");
  });

  it("rolls over month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("rolls over year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("supports negative days", () => {
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("nextMonday", () => {
  it("returns the following Monday from a Tuesday", () => {
    // 2026-07-28 is a Tuesday
    expect(nextMonday("2026-07-28")).toBe("2026-08-03");
  });

  it("skips a full week when already Monday", () => {
    // 2026-07-27 is a Monday
    expect(nextMonday("2026-07-27")).toBe("2026-08-03");
  });

  it("returns the Monday from a Sunday", () => {
    // 2026-08-02 is a Sunday
    expect(nextMonday("2026-08-02")).toBe("2026-08-03");
  });
});

describe("formatDueBadge", () => {
  it("returns empty string for null", () => {
    expect(formatDueBadge(null)).toBe("");
  });

  it("formats date only", () => {
    expect(formatDueBadge({ date: "2026-07-28", time: null })).toBe("Jul 28");
  });

  it("formats date with time", () => {
    expect(formatDueBadge({ date: "2026-07-28", time: "14:30" })).toBe("Jul 28 14:30");
  });
});

describe("formatCreatedAt", () => {
  it("formats unix seconds as local date and time", () => {
    const d = new Date(2026, 6, 28, 9, 5, 0);
    const sec = Math.floor(d.getTime() / 1000);
    expect(formatCreatedAt(sec)).toBe(`${localDateString(d)} 09:05`);
  });

  it("returns empty string for falsy input", () => {
    expect(formatCreatedAt(0)).toBe("");
  });
});

describe("classifyDue", () => {
  const today = "2026-07-28"; // Tuesday

  it("classifies null due as noDue", () => {
    expect(classifyDue(null, today)).toBe("noDue");
  });

  it("classifies past date as overdue", () => {
    expect(classifyDue({ date: "2026-07-27", time: null }, today)).toBe("overdue");
  });

  it("classifies today as today", () => {
    expect(classifyDue({ date: "2026-07-28", time: null }, today)).toBe("today");
  });

  it("classifies tomorrow as tomorrow", () => {
    expect(classifyDue({ date: "2026-07-29", time: null }, today)).toBe("tomorrow");
  });

  it("classifies later this week as thisWeek", () => {
    // week of 2026-07-28 (Tue) runs Mon 07-27 .. Sun 08-02
    expect(classifyDue({ date: "2026-08-01", time: null }, today)).toBe("thisWeek");
  });

  it("classifies beyond this week as later", () => {
    expect(classifyDue({ date: "2026-08-03", time: null }, today)).toBe("later");
  });
});

describe("compareDue", () => {
  it("sorts by date ascending", () => {
    const a = { due: { date: "2026-07-28", time: null } };
    const b = { due: { date: "2026-07-29", time: null } };
    expect(compareDue(a, b)).toBeLessThan(0);
    expect(compareDue(b, a)).toBeGreaterThan(0);
  });

  it("sorts by time within same date", () => {
    const a = { due: { date: "2026-07-28", time: "09:00" } };
    const b = { due: { date: "2026-07-28", time: "14:00" } };
    expect(compareDue(a, b)).toBeLessThan(0);
  });

  it("puts timeless tasks after timed tasks on the same date", () => {
    const timed = { due: { date: "2026-07-28", time: "09:00" } };
    const timeless = { due: { date: "2026-07-28", time: null } };
    expect(compareDue(timed, timeless)).toBeLessThan(0);
    expect(compareDue(timeless, timed)).toBeGreaterThan(0);
  });

  it("puts no-due tasks last", () => {
    const withDue = { due: { date: "2026-07-28", time: null } };
    const noDue = { due: null };
    expect(compareDue(withDue, noDue)).toBeLessThan(0);
    expect(compareDue(noDue, withDue)).toBeGreaterThan(0);
    expect(compareDue(noDue, noDue)).toBe(0);
  });
});

describe("groupByDue", () => {
  const today = "2026-07-28";

  it("groups and sorts tasks into non-empty sections in fixed order", () => {
    const tasks = [
      { id: "1", due: { date: "2026-08-05", time: null } }, // later
      { id: "2", due: null }, // noDue
      { id: "3", due: { date: "2026-07-28", time: "10:00" } }, // today
      { id: "4", due: { date: "2026-07-27", time: null } }, // overdue
      { id: "5", due: { date: "2026-07-28", time: "08:00" } }, // today, earlier time
    ];
    const groups = groupByDue(tasks, today);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "later", "noDue"]);
    const todayGroup = groups.find((g) => g.key === "today");
    expect(todayGroup!.tasks.map((t) => t.id)).toEqual(["5", "3"]);
  });

  it("omits empty sections", () => {
    const groups = groupByDue([{ id: "1", due: null }], today);
    expect(groups).toEqual([{ key: "noDue", label: "No Due Date", tasks: [{ id: "1", due: null }] }]);
  });

  it("returns empty array for no tasks", () => {
    expect(groupByDue([], today)).toEqual([]);
  });
});

describe("groupByParent", () => {
  it("groups by nearest parent name, preserving first-seen order", () => {
    const tasks = [
      { id: "1", parentId: "p1", parentPath: ["Root", "Work"] },
      { id: "2", parentId: "p2", parentPath: ["Root", "Home"] },
      { id: "3", parentId: "p1", parentPath: ["Root", "Work"] },
    ];
    const groups = groupByParent(tasks);
    expect(groups.map((g) => g.label)).toEqual(["Work", "Home"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["1", "3"]);
    expect(groups[0].path).toEqual(["Root", "Work"]);
  });

  it("labels tasks with no parent path", () => {
    const groups = groupByParent([{ id: "1", parentId: null, parentPath: [] }]);
    expect(groups[0].label).toBe("(no parent)");
  });
});

describe("groupByCreated", () => {
  const today = "2026-07-28"; // Tuesday, week starts 2026-07-27

  function tsFor(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return Math.floor(new Date(y, m - 1, d, 12, 0, 0).getTime() / 1000);
  }

  it("classifies into today/thisWeek/thisMonth/earlier, newest first", () => {
    const tasks = [
      { id: "old", createdAt: tsFor("2026-06-01") },
      { id: "week", createdAt: tsFor("2026-07-27") },
      { id: "month", createdAt: tsFor("2026-07-10") },
      { id: "today-early", createdAt: tsFor("2026-07-28") - 3600 },
      { id: "today-late", createdAt: tsFor("2026-07-28") },
    ];
    const groups = groupByCreated(tasks, today);
    expect(groups.map((g) => g.key)).toEqual(["today", "thisWeek", "thisMonth", "earlier"]);
    const todayGroup = groups.find((g) => g.key === "today");
    expect(todayGroup!.tasks.map((t) => t.id)).toEqual(["today-late", "today-early"]);
  });
});

describe("workflowyUrl", () => {
  it("uses the last 12 hex chars with hyphens stripped", () => {
    const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const stripped = uuid.replace(/-/g, "");
    const expected = `https://workflowy.com/#/${stripped.slice(-12)}`;
    expect(workflowyUrl(uuid)).toBe(expected);
  });

  it("handles ids shorter than 12 chars without throwing", () => {
    expect(workflowyUrl("abc123")).toBe("https://workflowy.com/#/abc123");
  });
});

describe("swipeDirection", () => {
  it("returns null below threshold", () => {
    expect(swipeDirection(5, 5, 10)).toBeNull();
  });

  it("returns horizontal when dx dominates", () => {
    expect(swipeDirection(30, 5, 10)).toBe("horizontal");
  });

  it("returns vertical when dy dominates", () => {
    expect(swipeDirection(5, 30, 10)).toBe("vertical");
  });
});

describe("resolveSwipeAction", () => {
  it("returns complete for right swipe past threshold", () => {
    expect(resolveSwipeAction(100, 80)).toBe("complete");
  });

  it("returns schedule for left swipe past threshold", () => {
    expect(resolveSwipeAction(-100, 80)).toBe("schedule");
  });

  it("returns null below threshold", () => {
    expect(resolveSwipeAction(30, 80)).toBeNull();
  });
});

describe("scheduleShortcut", () => {
  const today = "2026-07-28";

  it("resolves today", () => {
    expect(scheduleShortcut("today", today)).toEqual({ date: "2026-07-28" });
  });

  it("resolves tomorrow", () => {
    expect(scheduleShortcut("tomorrow", today)).toEqual({ date: "2026-07-29" });
  });

  it("resolves nextMonday", () => {
    expect(scheduleShortcut("nextMonday", today)).toEqual({ date: "2026-08-03" });
  });

  it("returns null for unknown option", () => {
    expect(scheduleShortcut("bogus", today)).toBeNull();
  });
});
