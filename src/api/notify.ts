import type { Task, NotificationSettings } from "../types";
import { jstDateString, jstHour, jstDateTimeFromParts } from "./jst";

// A single push notification to send, plus the notified-key(s) it should be
// recorded under once sent successfully.
export type NotificationPlan =
  | { type: "timed"; key: string; tasks: [Task] }
  // The morning digest: tasks due today plus everything still open past its
  // due date. The overdue section repeats each morning (keyed by today's
  // date) until the task is completed or rescheduled.
  | { type: "daily"; keys: string[]; tasks: Task[]; overdueTasks: Task[] };

export interface SelectDueNotificationsResult {
  notifications: NotificationPlan[];
  // Keys that should be recorded as notified WITHOUT sending a push - used to
  // keep a pre-existing backlog of timed tasks from firing a burst of
  // individual pushes on the first Cron run (they still show up in the
  // digest's overdue section).
  keysToMarkNotified: string[];
}

// Only timed tasks that became due within this window get their individual
// push; anything older is treated as pre-existing backlog and silently
// marked notified instead.
const OVERDUE_WINDOW_MS = 24 * 60 * 60 * 1000;

function timedKey(taskId: string, date: string, time: string): string {
  return `${taskId}:${date}:${time}`;
}

function dailyKey(date: string, taskId: string): string {
  return `daily:${date}:${taskId}`;
}

// Keyed by *today*, not the due date, so the same overdue task fires again
// each new morning.
export function overdueKey(today: string, taskId: string): string {
  return `overdue:${today}:${taskId}`;
}

export function selectDueNotifications(
  tasks: Task[],
  now: Date,
  settings: NotificationSettings,
  notifiedKeys: Set<string>
): SelectDueNotificationsResult {
  const notifications: NotificationPlan[] = [];
  const keysToMarkNotified: string[] = [];

  const today = jstDateString(now);
  const currentHour = jstHour(now);
  const nowMs = now.getTime();

  const dailyBundleTasks: Task[] = [];
  const dailyBundleKeys: string[] = [];
  const overdueBundleTasks: Task[] = [];
  const overdueBundleKeys: string[] = [];

  for (const task of tasks) {
    if (!task.due) continue;

    if (task.due.time) {
      // Individual push the moment a timed task's due time passes.
      const dueInstant = jstDateTimeFromParts(task.due.date, task.due.time);
      if (dueInstant.getTime() <= nowMs) {
        const key = timedKey(task.id, task.due.date, task.due.time);
        if (!notifiedKeys.has(key)) {
          const overdueMs = nowMs - dueInstant.getTime();
          if (overdueMs > OVERDUE_WINDOW_MS) {
            // Pre-existing backlog: mark notified without an individual
            // push. The digest's overdue section still covers the task.
            keysToMarkNotified.push(key);
          } else {
            notifications.push({ type: "timed", key, tasks: [task] });
          }
        }
      }
    } else if (task.due.date === today) {
      // Date-only tasks due today go into the morning digest.
      if (currentHour >= settings.morningHour) {
        const key = dailyKey(task.due.date, task.id);
        if (!notifiedKeys.has(key)) {
          dailyBundleTasks.push(task);
          dailyBundleKeys.push(key);
        }
      }
    }

    // Anything (timed or not) still open past its due date joins the
    // digest's overdue section, every morning anew.
    if (task.due.date < today && currentHour >= settings.morningHour) {
      const key = overdueKey(today, task.id);
      if (!notifiedKeys.has(key)) {
        overdueBundleTasks.push(task);
        overdueBundleKeys.push(key);
      }
    }
  }

  if (dailyBundleTasks.length > 0 || overdueBundleTasks.length > 0) {
    notifications.push({
      type: "daily",
      keys: [...dailyBundleKeys, ...overdueBundleKeys],
      tasks: dailyBundleTasks,
      overdueTasks: overdueBundleTasks,
    });
  }

  return { notifications, keysToMarkNotified };
}
