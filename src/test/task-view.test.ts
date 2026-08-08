import { describe, it, expect } from "vitest";

const {
  localDateString,
  addDays,
  nextMonday,
  normalizeTitle,
  formatDueShort,
  formatDueDetail,
  formatHeaderDate,
  formatSyncAgo,
  classifyDue,
  compareDue,
  groupTasksForView,
  summarizeNodes,
  filterFinishedNodes,
  groupNodeTasks,
  donutDash,
  workflowyUrl,
  swipeDirection,
  resolveSwipeAction,
  clampDx,
  dueShortcut,
} = await import("../../public/scripts/tasks.js");

const TODAY = "2026-08-01"; // Saturday

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    plainName: "Task",
    note: null,
    parentId: null,
    parentPath: [],
    createdAt: 0,
    due: null,
    completed: false,
    ...overrides,
  };
}

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
});

describe("nextMonday", () => {
  it("returns the following Monday for a Saturday", () => {
    expect(nextMonday("2026-08-01")).toBe("2026-08-03");
  });

  it("returns a week later when the date is already Monday", () => {
    expect(nextMonday("2026-08-03")).toBe("2026-08-10");
  });

  it("returns the next day for a Sunday", () => {
    expect(nextMonday("2026-08-02")).toBe("2026-08-03");
  });
});

describe("normalizeTitle", () => {
  it("strips HTML tags but keeps their text", () => {
    expect(normalizeTitle('read <a href="https://example.com">this article</a> today')).toBe(
      "read this article today"
    );
    expect(normalizeTitle("<b>bold</b> and <i>italic</i>")).toBe("bold and italic");
  });

  it("decodes common HTML entities", () => {
    expect(normalizeTitle("A &amp; B &lt;ok&gt;")).toBe("A & B <ok>");
  });

  it("strips a leading time prefix", () => {
    expect(normalizeTitle("19:44 夜の泳ぎ")).toBe("夜の泳ぎ");
    expect(normalizeTitle("9:05 meeting")).toBe("meeting");
  });

  it("keeps times that are not a prefix", () => {
    expect(normalizeTitle("meeting at 19:44")).toBe("meeting at 19:44");
  });

  it("strips emoji", () => {
    expect(normalizeTitle("🔥 burn down the backlog 🚀")).toBe("burn down the backlog");
    expect(normalizeTitle("家族👨‍👩‍👧‍👦と話す")).toBe("家族と話す");
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("  a   b  ")).toBe("a b");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeTitle(null)).toBe("");
    expect(normalizeTitle(undefined)).toBe("");
  });
});

describe("formatDueShort", () => {
  it("formats MM/DD for the current year", () => {
    expect(formatDueShort({ date: "2026-08-05", time: null }, TODAY)).toBe("08/05");
  });

  it("formats MM/DD for past years (red color already signals overdue)", () => {
    expect(formatDueShort({ date: "2025-12-31", time: null }, TODAY)).toBe("12/31");
  });

  it("formats YY/MM/DD for next year and later", () => {
    expect(formatDueShort({ date: "2027-01-12", time: null }, TODAY)).toBe("27/01/12");
  });

  it("returns empty string for null due", () => {
    expect(formatDueShort(null, TODAY)).toBe("");
  });
});

describe("formatDueDetail", () => {
  it("appends the time when present", () => {
    expect(formatDueDetail({ date: "2026-08-01", time: "11:41" }, TODAY)).toBe("08/01 11:41");
  });

  it("omits the time when absent", () => {
    expect(formatDueDetail({ date: "2026-08-01", time: null }, TODAY)).toBe("08/01");
  });

  it("returns 期限なし for null due", () => {
    expect(formatDueDetail(null, TODAY)).toBe("期限なし");
  });
});

describe("formatHeaderDate", () => {
  it("formats a date as M月D日（曜）", () => {
    expect(formatHeaderDate("2026-08-01")).toBe("8月1日（土）");
    expect(formatHeaderDate("2026-12-07")).toBe("12月7日（月）");
  });
});

describe("formatSyncAgo", () => {
  it("returns 未同期 when there is no sync timestamp", () => {
    expect(formatSyncAgo(1000000, null)).toBe("未同期");
  });

  it("returns たった今同期 within a minute", () => {
    expect(formatSyncAgo(60_000, 30_000)).toBe("たった今同期");
  });

  it("returns minutes", () => {
    expect(formatSyncAgo(4 * 60_000, 60_000)).toBe("3 分前に同期");
  });

  it("returns hours", () => {
    expect(formatSyncAgo(3 * 3600_000, 3600_000)).toBe("2 時間前に同期");
  });

  it("returns days", () => {
    expect(formatSyncAgo(50 * 3600_000, 0)).toBe("2 日前に同期");
  });
});

describe("classifyDue", () => {
  it("classifies missing due as noDue", () => {
    expect(classifyDue(null, TODAY)).toBe("noDue");
  });

  it("classifies past dates as overdue", () => {
    expect(classifyDue({ date: "2026-07-31", time: null }, TODAY)).toBe("overdue");
  });

  it("classifies today", () => {
    expect(classifyDue({ date: "2026-08-01", time: null }, TODAY)).toBe("today");
  });

  it("classifies tomorrow", () => {
    expect(classifyDue({ date: "2026-08-02", time: null }, TODAY)).toBe("tomorrow");
  });

  it("classifies up to 7 days ahead as thisWeek", () => {
    expect(classifyDue({ date: "2026-08-03", time: null }, TODAY)).toBe("thisWeek");
    expect(classifyDue({ date: "2026-08-08", time: null }, TODAY)).toBe("thisWeek");
  });

  it("classifies more than 7 days ahead as later", () => {
    expect(classifyDue({ date: "2026-08-09", time: null }, TODAY)).toBe("later");
  });
});

describe("compareDue", () => {
  it("sorts by date ascending", () => {
    const a = task({ due: { date: "2026-08-01", time: null } });
    const b = task({ due: { date: "2026-08-02", time: null } });
    expect(compareDue(a, b)).toBeLessThan(0);
  });

  it("sorts timed tasks before untimed tasks on the same date", () => {
    const a = task({ due: { date: "2026-08-01", time: "09:00" } });
    const b = task({ due: { date: "2026-08-01", time: null } });
    expect(compareDue(a, b)).toBeLessThan(0);
    expect(compareDue(b, a)).toBeGreaterThan(0);
  });

  it("sorts tasks without due last", () => {
    const a = task({ due: null });
    const b = task({ due: { date: "2026-08-01", time: null } });
    expect(compareDue(a, b)).toBeGreaterThan(0);
  });
});

describe("groupTasksForView (today)", () => {
  it("returns overdue then today groups only", () => {
    const tasks = [
      task({ id: "od", due: { date: "2026-07-25", time: null } }),
      task({ id: "td", due: { date: "2026-08-01", time: null } }),
      task({ id: "tm", due: { date: "2026-08-02", time: null } }),
      task({ id: "nd", due: null }),
    ];
    const groups = groupTasksForView(tasks, "today", TODAY);
    expect(groups.map((g: { label: string }) => g.label)).toEqual(["期限切れ", "今日"]);
    expect(groups[0].overdue).toBe(true);
    expect(groups[0].tasks.map((t: { id: string }) => t.id)).toEqual(["od"]);
    expect(groups[1].tasks.map((t: { id: string }) => t.id)).toEqual(["td"]);
  });

  it("excludes completed tasks", () => {
    const tasks = [task({ id: "a", due: { date: "2026-08-01", time: null }, completed: true })];
    expect(groupTasksForView(tasks, "today", TODAY)).toEqual([]);
  });

  it("omits empty groups", () => {
    const tasks = [task({ id: "td", due: { date: "2026-08-01", time: null } })];
    const groups = groupTasksForView(tasks, "today", TODAY);
    expect(groups.map((g: { label: string }) => g.label)).toEqual(["今日"]);
  });
});

describe("groupTasksForView (due)", () => {
  it("returns groups in 期限切れ→今日→明日→今週→それ以降→いつか order", () => {
    const tasks = [
      task({ id: "nd", due: null }),
      task({ id: "lt", due: { date: "2026-09-01", time: null } }),
      task({ id: "wk", due: { date: "2026-08-05", time: null } }),
      task({ id: "tm", due: { date: "2026-08-02", time: null } }),
      task({ id: "td", due: { date: "2026-08-01", time: null } }),
      task({ id: "od", due: { date: "2026-07-25", time: null } }),
    ];
    const groups = groupTasksForView(tasks, "due", TODAY);
    expect(groups.map((g: { label: string }) => g.label)).toEqual([
      "期限切れ",
      "今日",
      "明日",
      "今週",
      "それ以降",
      "いつか（期限なし）",
    ]);
  });

  it("sorts within a group by date and time", () => {
    const tasks = [
      task({ id: "b", due: { date: "2026-07-29", time: null } }),
      task({ id: "a", due: { date: "2026-07-25", time: null } }),
    ];
    const groups = groupTasksForView(tasks, "due", TODAY);
    expect(groups[0].tasks.map((t: { id: string }) => t.id)).toEqual(["a", "b"]);
  });
});

describe("summarizeNodes", () => {
  const tasks = [
    task({ id: "a", parentId: "p1", parentPath: ["Root", "Project A"] }),
    task({ id: "b", parentId: "p1", parentPath: ["Root", "Project A"], completed: true }),
    task({ id: "c", parentId: "p2", parentPath: ["Project B"], due: { date: "2026-07-25", time: null } }),
    task({ id: "d", parentId: null, parentPath: [] }),
  ];

  it("groups by nearest parent in first-seen order with counts", () => {
    const nodes = summarizeNodes(tasks, TODAY);
    expect(nodes.map((n: { label: string }) => n.label)).toEqual(["Project A", "Project B", "（ノードなし）"]);
    expect(nodes[0].total).toBe(2);
    expect(nodes[0].done).toBe(1);
  });

  it("flags nodes containing an incomplete overdue task", () => {
    const nodes = summarizeNodes(tasks, TODAY);
    expect(nodes[0].hasOverdue).toBe(false);
    expect(nodes[1].hasOverdue).toBe(true);
  });

  it("does not flag overdue when the overdue task is completed", () => {
    const nodes = summarizeNodes(
      [task({ id: "a", parentId: "p1", parentPath: ["P"], due: { date: "2026-07-25", time: null }, completed: true })],
      TODAY
    );
    expect(nodes[0].hasOverdue).toBe(false);
  });

  it("normalizes the node label", () => {
    const nodes = summarizeNodes([task({ parentId: "p1", parentPath: ["<b>Bold</b> 🔥 name"] })], TODAY);
    expect(nodes[0].label).toBe("Bold name");
  });
});

describe("filterFinishedNodes", () => {
  const open = { key: "p1", label: "Project A", total: 3, done: 1, hasOverdue: false, tasks: [] };
  const finished = { key: "p2", label: "Project B", total: 2, done: 2, hasOverdue: false, tasks: [] };
  const empty = { key: "p3", label: "Project C", total: 0, done: 0, hasOverdue: false, tasks: [] };

  it("drops nodes whose todos are all done", () => {
    expect(filterFinishedNodes([open, finished], false).map((n: { key: string }) => n.key)).toEqual(["p1"]);
  });

  it("keeps every node when showFinished is true", () => {
    expect(filterFinishedNodes([open, finished], true).map((n: { key: string }) => n.key)).toEqual(["p1", "p2"]);
  });

  it("keeps nodes with no todos at all", () => {
    expect(filterFinishedNodes([empty], false).map((n: { key: string }) => n.key)).toEqual(["p3"]);
  });
});

describe("groupNodeTasks", () => {
  it("splits into 未完了 and 完了 groups", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", completed: true }), task({ id: "c" })];
    const groups = groupNodeTasks(tasks);
    expect(groups.map((g: { label: string }) => g.label)).toEqual(["未完了", "完了"]);
    expect(groups[0].tasks.map((t: { id: string }) => t.id)).toEqual(["a", "c"]);
    expect(groups[1].tasks.map((t: { id: string }) => t.id)).toEqual(["b"]);
  });

  it("omits empty groups", () => {
    const groups = groupNodeTasks([task({ id: "a" })]);
    expect(groups.map((g: { label: string }) => g.label)).toEqual(["未完了"]);
  });

  it("omits the 完了 group when showCompleted is false", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", completed: true })];
    const groups = groupNodeTasks(tasks, false);
    expect(groups.map((g: { label: string }) => g.label)).toEqual(["未完了"]);
    expect(groups[0].tasks.map((t: { id: string }) => t.id)).toEqual(["a"]);
  });
});

describe("donutDash", () => {
  it("returns dasharray proportional to done/total on a r=8 circle", () => {
    expect(donutDash(0, 4)).toBe("0.0 50.3");
    expect(donutDash(2, 4)).toBe("25.1 50.3");
    expect(donutDash(4, 4)).toBe("50.3 50.3");
  });

  it("returns zero progress for an empty node", () => {
    expect(donutDash(0, 0)).toBe("0.0 50.3");
  });
});

describe("workflowyUrl", () => {
  it("uses the last 12 hex chars of the UUID", () => {
    expect(workflowyUrl("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      "https://workflowy.com/#/ef1234567890"
    );
  });
});

describe("swipeDirection", () => {
  it("returns null below threshold", () => {
    expect(swipeDirection(4, 4, 10)).toBeNull();
  });

  it("detects horizontal", () => {
    expect(swipeDirection(20, 5, 10)).toBe("horizontal");
  });

  it("detects vertical", () => {
    expect(swipeDirection(5, 20, 10)).toBe("vertical");
  });
});

describe("resolveSwipeAction", () => {
  it("completes on right swipe past +72", () => {
    expect(resolveSwipeAction(73)).toBe("complete");
  });

  it("deletes on left swipe past -72", () => {
    expect(resolveSwipeAction(-73)).toBe("delete");
  });

  it("returns null within the threshold", () => {
    expect(resolveSwipeAction(50)).toBeNull();
    expect(resolveSwipeAction(-50)).toBeNull();
  });
});

describe("clampDx", () => {
  it("clamps drag distance to ±130", () => {
    expect(clampDx(200)).toBe(130);
    expect(clampDx(-200)).toBe(-130);
    expect(clampDx(42)).toBe(42);
  });
});

describe("dueShortcut", () => {
  it("maps chips to dates", () => {
    expect(dueShortcut("today", TODAY)).toEqual({ date: "2026-08-01" });
    expect(dueShortcut("tomorrow", TODAY)).toEqual({ date: "2026-08-02" });
    expect(dueShortcut("week", TODAY)).toEqual({ date: "2026-08-03" });
  });

  it("returns null for 期限なし and unknown options", () => {
    expect(dueShortcut("none", TODAY)).toBeNull();
    expect(dueShortcut("bogus", TODAY)).toBeNull();
  });
});
