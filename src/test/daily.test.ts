import { describe, it, expect, vi } from "vitest";
import { addDays, dateKeysBack, toViewItem, collectDailyHistory, DAILY_GROUP_LIMIT } from "../api/daily";
import type { WorkflowyNode } from "../types";

function makeNode(overrides: Partial<WorkflowyNode> = {}): WorkflowyNode {
  return {
    id: "node-1",
    name: "Some note",
    note: null,
    priority: 0,
    createdAt: 1000,
    modifiedAt: 1000,
    completedAt: null,
    ...overrides,
  };
}

describe("addDays", () => {
  it("adds and subtracts calendar days across month boundaries", () => {
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-08-08", 0)).toBe("2026-08-08");
  });
});

describe("dateKeysBack", () => {
  it("returns count keys walking backward from start", () => {
    expect(dateKeysBack("2026-08-08", 3)).toEqual(["2026-08-08", "2026-08-07", "2026-08-06"]);
  });
});

describe("toViewItem", () => {
  it("maps a plain note node", () => {
    const item = toViewItem(makeNode({ id: "a", name: "Memo", note: "body" }));
    expect(item).toEqual({
      id: "a",
      name: "Memo",
      plainName: "Memo",
      note: "body",
      todo: false,
      completed: false,
      due: null,
      createdAt: 1000,
    });
  });

  it("marks todo nodes and parses due from time markup", () => {
    const item = toViewItem(
      makeNode({
        name: 'Task <time startYear="2026" startMonth="8" startDay="10">Aug 10</time>',
        data: { layoutMode: "todo" },
      })
    );
    expect(item.todo).toBe(true);
    expect(item.plainName).toBe("Task");
    expect(item.due).toEqual({ date: "2026-08-10", time: null });
  });

  it("marks completed nodes", () => {
    expect(toViewItem(makeNode({ completedAt: 123 })).completed).toBe(true);
  });
});

describe("collectDailyHistory", () => {
  it("starts at local_date + 1 on initial load and skips empty days", async () => {
    const byKey: Record<string, WorkflowyNode[]> = {
      "2026-08-08": [makeNode({ id: "a" })],
      "2026-08-06": [makeNode({ id: "b" }), makeNode({ id: "c" })],
    };
    const getCalendarNodes = vi.fn(async (key: string) => byKey[key] ?? []);

    const groups = await collectDailyHistory({ getCalendarNodes }, { localDate: "2026-08-08" });

    // Probed 2026-08-09 first (timezone skew), but empty days are omitted.
    expect(getCalendarNodes).toHaveBeenCalledWith("2026-08-09");
    expect(groups.map((g) => g.date)).toEqual(["2026-08-08", "2026-08-06"]);
    expect(groups[0].items[0].id).toBe("a");
    expect(groups[1].items).toHaveLength(2);
  });

  it("continues from before_date - 1 when paginating", async () => {
    const getCalendarNodes = vi.fn(async () => []);
    await collectDailyHistory({ getCalendarNodes }, { beforeDate: "2026-08-01" });
    expect(getCalendarNodes).toHaveBeenCalledWith("2026-07-31");
    expect(getCalendarNodes).not.toHaveBeenCalledWith("2026-08-01");
  });

  it("stops after the scan cap and does not flag hasMore on an empty tail", async () => {
    const getCalendarNodes = vi.fn(async () => []);
    const groups = await collectDailyHistory({ getCalendarNodes }, { localDate: "2026-08-08" });
    expect(getCalendarNodes).toHaveBeenCalledTimes(31);
    expect(groups).toEqual([]);
  });

  it("flags hasMore on the last group when the page fills up", async () => {
    const getCalendarNodes = vi.fn(async (key: string) => [makeNode({ id: key })]);
    const groups = await collectDailyHistory({ getCalendarNodes }, { localDate: "2026-08-08" });
    expect(groups).toHaveLength(DAILY_GROUP_LIMIT);
    expect(groups[groups.length - 1].hasMore).toBe(true);
    expect(groups.slice(0, -1).every((g) => !g.hasMore)).toBe(true);
  });
});
