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
    completed: false,
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

  it("suppresses the per-task push for timed tasks overdue by more than 24 hours, leaving them to the digest", () => {
    const now = new Date("2026-07-28T06:00:00Z"); // 15:00 JST
    // Due more than 24h ago
    const task = makeTask({ id: "old", due: { date: "2026-07-26", time: "10:00" } });
    const result = selectDueNotifications([task], now, settings, new Set());

    // No individual timed push, and its timed key is recorded so it never
    // suddenly fires one. The task itself still surfaces via the overdue
    // section of the morning digest.
    expect(result.notifications.filter((n) => n.type === "timed")).toHaveLength(0);
    expect(result.keysToMarkNotified).toContain("old:2026-07-26:10:00");
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({ type: "daily", overdueTasks: [task] });
  });

  it("notifies timed tasks within the 24h overdue window", () => {
    const now = new Date("2026-07-28T06:00:00Z"); // 15:00 JST
    // 23 hours overdue
    const task = makeTask({ id: "t1", due: { date: "2026-07-27", time: "16:00" } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications.filter((n) => n.type === "timed")).toHaveLength(1);
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

  it("ignores date-only tasks whose due date is in the future", () => {
    const now = new Date("2026-07-28T05:00:00Z"); // 14:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-29", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(0);
    expect(result.keysToMarkNotified).toHaveLength(0);
  });
});

describe("selectDueNotifications - overdue digest", () => {
  it("includes an overdue date-only task in the morning digest, keyed by today's date", () => {
    const now = new Date("2026-07-28T01:00:00Z"); // 10:00 JST, past morning hour
    const task = makeTask({ id: "old", due: { date: "2026-07-25", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());

    expect(result.notifications).toHaveLength(1);
    const plan = result.notifications[0];
    expect(plan).toMatchObject({ type: "daily", tasks: [], overdueTasks: [task] });
    if (plan.type === "daily") {
      expect(plan.keys).toEqual(["overdue:2026-07-28:old"]);
    }
    expect(result.keysToMarkNotified).toHaveLength(0);
  });

  it("includes an overdue timed task in the digest", () => {
    const now = new Date("2026-07-28T01:00:00Z"); // 10:00 JST
    const task = makeTask({ id: "t1", due: { date: "2026-07-25", time: "10:00" } });
    const result = selectDueNotifications(
      [task],
      now,
      settings,
      new Set(["t1:2026-07-25:10:00"]) // its one-shot timed push already fired
    );

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({ type: "daily", overdueTasks: [task] });
  });

  it("does not fire the overdue digest before the morning hour", () => {
    const now = new Date("2026-07-27T23:00:00Z"); // 08:00 JST
    const task = makeTask({ id: "old", due: { date: "2026-07-25", time: null } });
    const result = selectDueNotifications([task], now, settings, new Set());
    expect(result.notifications).toHaveLength(0);
    // Not marked either: it waits for the morning digest instead.
    expect(result.keysToMarkNotified).toHaveLength(0);
  });

  it("does not repeat the overdue digest within the same day", () => {
    const now = new Date("2026-07-28T05:00:00Z"); // 14:00 JST, digest already sent this morning
    const task = makeTask({ id: "old", due: { date: "2026-07-25", time: null } });
    const result = selectDueNotifications(
      [task],
      now,
      settings,
      new Set(["overdue:2026-07-28:old"])
    );
    expect(result.notifications).toHaveLength(0);
  });

  it("repeats each morning until the task is completed or rescheduled", () => {
    const now = new Date("2026-07-28T01:00:00Z"); // 10:00 JST on the 28th
    const task = makeTask({ id: "old", due: { date: "2026-07-25", time: null } });
    const result = selectDueNotifications(
      [task],
      now,
      settings,
      new Set(["overdue:2026-07-27:old"]) // yesterday's digest already covered it
    );

    expect(result.notifications).toHaveLength(1);
    const plan = result.notifications[0];
    if (plan.type === "daily") {
      expect(plan.keys).toEqual(["overdue:2026-07-28:old"]);
    }
  });

  it("bundles today's tasks and overdue tasks into a single digest", () => {
    const now = new Date("2026-07-28T00:30:00Z"); // 09:30 JST
    const dueToday = makeTask({ id: "t1", due: { date: "2026-07-28", time: null } });
    const overdue = makeTask({ id: "old", due: { date: "2026-07-26", time: null } });
    const result = selectDueNotifications([dueToday, overdue], now, settings, new Set());

    expect(result.notifications).toHaveLength(1);
    const plan = result.notifications[0];
    expect(plan).toMatchObject({ type: "daily", tasks: [dueToday], overdueTasks: [overdue] });
    if (plan.type === "daily") {
      expect(plan.keys.sort()).toEqual(["daily:2026-07-28:t1", "overdue:2026-07-28:old"]);
    }
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
