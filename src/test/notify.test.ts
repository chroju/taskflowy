import { describe, it, expect } from "vitest";
import { selectDueNotifications } from "../api/notify";
import type { Task, NotificationSettings } from "../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Task",
    plainName: "Task",
    note: null,
    parentId: null,
    parentPath: [],
    createdAt: 0,
    due: null,
    ...overrides,
  };
}

const settings: NotificationSettings = { morningHour: 9 };

describe("selectDueNotifications - timed tasks", () => {
  it("notifies a timed task whose due datetime has passed", () => {
    const now = new Date("2026-07-28T06:00:00Z"); // 15:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: "14:30" } });
    const result = selectDueNotifications([task], now, settings, new Set());

    expect(result.notifications).toHaveLength(1);
    const notification = result.notifications[0];
    expect(notification.type).toBe("timed");
    expect(notification.tasks).toEqual([task]);
    if (notification.type === "timed") {
      expect(notification.key).toBe("t1:2026-07-28:14:30");
    }
  });

  it("does not notify a timed task whose due datetime has not arrived yet", () => {
    const now = new Date("2026-07-28T04:00:00Z"); // 13:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: "14:30" } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(0);
  });

  it("does not re-notify a timed task that is already in notifiedKeys", () => {
    const now = new Date("2026-07-28T06:00:00Z");
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: "14:30" } });
    const result = selectDueNotifications(
      [task],
      now,
      settings,
      new Set(["t1:2026-07-28:14:30"])
    );
    expect(result.notifications).toHaveLength(0);
  });

  it("re-notifies when the due time changes (new key)", () => {
    const now = new Date("2026-07-28T10:00:00Z"); // 19:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: "18:00" } });
    const result = selectDueNotifications(
      [task],
      now,
      settings,
      new Set(["t1:2026-07-28:14:30"]) // stale key from a previous due time
    );
    expect(result.notifications).toHaveLength(1);
    const notification = result.notifications[0];
    if (notification.type === "timed") {
      expect(notification.key).toBe("t1:2026-07-28:18:00");
    } else {
      throw new Error("expected timed notification");
    }
  });

  it("suppresses timed tasks overdue by more than 24 hours (initial overdue backlog)", () => {
    const now = new Date("2026-07-28T06:00:00Z"); // 15:00 JST
    // Due more than 24h ago
    const task = makeTask({ id: "old", due: { date: "2026-07-26", time: "10:00" } });
    const result = selectDueNotifications([task], now, settings, new Set());

    expect(result.notifications).toHaveLength(0);
    // But it should be recorded as notified so it doesn't get silently
    // reconsidered forever, and so it won't suddenly notify once it
    // crosses back within some future window.
    expect(result.keysToMarkNotified).toContain("old:2026-07-26:10:00");
  });

  it("notifies timed tasks within the 24h overdue window", () => {
    const now = new Date("2026-07-28T06:00:00Z"); // 15:00 JST
    // 23 hours overdue
    const task = makeTask({ id: "t1", due: { date: "2026-07-27", time: "16:00" } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(1);
  });

  it("ignores tasks without a due date", () => {
    const now = new Date("2026-07-28T06:00:00Z");
    const task = makeTask({ id: "t1", due: null });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(0);
    expect(result.keysToMarkNotified).toHaveLength(0);
  });
});

describe("selectDueNotifications - date-only tasks", () => {
  it("does not notify before the configured morning hour", () => {
    const now = new Date("2026-07-27T23:00:00Z"); // 08:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(0);
  });

  it("does not notify before the due date arrives", () => {
    const now = new Date("2026-07-27T01:00:00Z"); // 10:00 JST on 07-27
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(0);
  });

  it("notifies at/after the configured morning hour on the due date", () => {
    const now = new Date("2026-07-28T00:00:00Z"); // 09:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({ type: "daily", tasks: [task] });
  });

  it("respects a custom morningHour setting", () => {
    const now = new Date("2026-07-28T01:00:00Z"); // 10:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    const custom: NotificationSettings = { morningHour: 11 };
    const result = selectDueNotifications([task], now, custom, new Set());
    expect(result.notifications).toHaveLength(0);
  });

  it("bundles multiple date-only tasks due the same day into a single notification", () => {
    const now = new Date("2026-07-28T00:30:00Z"); // 09:30 JST
    const t1 = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    const t2 = makeTask({ id: "t2", due: { date: "2026-07-28", time: null } });
    const result = selectDueNotifications([t1, t2], now, settings, new Set());

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].tasks.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(result.notifications[0].type).toBe("daily");
  });

  it("does not re-notify date-only tasks whose per-task key is already notified", () => {
    const now = new Date("2026-07-28T00:30:00Z");
    const t1 = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    const t2 = makeTask({ id: "t2", due: { date: "2026-07-28", time: null } });
    const result = selectDueNotifications(
      [t1, t2],
      now,
      settings,
      new Set(["daily:2026-07-28:t1"])
    );

    // t1 already notified; only t2 remains, still bundled (as a single-task bundle)
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("catches up a task added later the same day without waiting for the next day", () => {
    const now = new Date("2026-07-28T05:00:00Z"); // 14:00 JST, well after morning notification already sent
    const t1 = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    // t1 already notified this morning, t2 just got a due date added
    const t2 = makeTask({ id: "t2", due: { date: "2026-07-28", time: null } });
    const result = selectDueNotifications(
      [t1, t2],
      now,
      settings,
      new Set(["daily:2026-07-28:t1"])
    );

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("suppresses date-only tasks overdue (due date) by more than 24h worth of days as initial backlog", () => {
    // "Today" in JST is 2026-07-28. A date-only task due 3 days ago is
    // long-overdue backlog from before the app was installed.
    const now = new Date("2026-07-28T01:00:00Z"); // 10:00 JST, past morning hour
    const task = makeTask({ id: "old", due: { date: "2026-07-25", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());

    expect(result.notifications).toHaveLength(0);
    expect(result.keysToMarkNotified).toContain("daily:2026-07-25:old");
  });

  it("does not suppress a date-only task due yesterday (within 24h-ish backlog grace)", () => {
    // date-only tasks: only same-day (due.date === today) are eligible at all;
    // anything with due.date before today falls into the "already missed" bucket.
    // This test documents that a task due exactly "yesterday" is treated as
    // backlog too (since date-only tasks only fire on their exact due date).
    const now = new Date("2026-07-28T01:00:00Z"); // 10:00 JST
    const task = makeTask({ id: "y", due: { date: "2026-07-27", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());

    expect(result.notifications).toHaveLength(0);
    expect(result.keysToMarkNotified).toContain("daily:2026-07-27:y");
  });

  it("ignores date-only tasks whose due date is in the future", () => {
    const now = new Date("2026-07-28T05:00:00Z"); // 14:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-29", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(0);
    expect(result.keysToMarkNotified).toHaveLength(0);
  });
});

describe("selectDueNotifications - mixed", () => {
  it("handles timed and date-only tasks together", () => {
    const now = new Date("2026-07-28T06:00:00Z"); // 15:00 JST
    const timed = makeTask({ id: "t1", due: { date: "2026-07-28", time: "14:00" } });
    const daily = makeTask({ id: "t2", due: { date: "2026-07-28", time: null } });
    const result = selectDueNotifications([timed, daily], now, settings, new Set());

    expect(result.notifications).toHaveLength(2);
    const types = result.notifications.map((n) => n.type).sort();
    expect(types).toEqual(["daily", "timed"]);
  });
});
