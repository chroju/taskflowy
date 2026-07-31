import type { Task, NotificationSettings } from "../types";
import { jstDateString, jstHour, jstDateTimeFromParts } from "./jst";

// A single push notification to send, plus the notified-key(s) it should be
// recorded under once sent successfully.
export type NotificationPlan =
  | { type: "timed"; key: string; tasks: [Task] }
  | { type: "daily"; keys: string[]; tasks: Task[] };

export interface SelectDueNotificationsResult {
  notifications: NotificationPlan[];
  // Keys that should be recorded as notified WITHOUT sending a push - used to
  // suppress a large backlog of overdue tasks (e.g. from before the app was
  // installed) from all firing at once on the first Cron run.
  keysToMarkNotified: string[];
}

// Only tasks that became due within this window are actually notified;
// anything older is treated as pre-existing backlog and silently marked
// notified instead.
const OVERDUE_WINDOW_MS = 24 * 60 * 60 * 1000;

function timedKey(taskId: string, date: string, time: string): string {
  return `${taskId}:${date}:${time}`;
}

function dailyKey(date: string, taskId: string): string {
  return `daily:${date}:${taskId}`;
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

  for (const task of tasks) {
    if (!task.due) continue;

    if (task.due.time) {
      const dueInstant = jstDateTimeFromParts(task.due.date, task.due.time);
      if (dueInstant.getTime() > nowMs) continue; // not due yet

      const key = timedKey(task.id, task.due.date, task.due.time);
      if (notifiedKeys.has(key)) continue;

      const overdueMs = nowMs - dueInstant.getTime();
      if (overdueMs > OVERDUE_WINDOW_MS) {
        // Pre-existing backlog: mark notified without sending.
        keysToMarkNotified.push(key);
        continue;
      }

      notifications.push({ type: "timed", key, tasks: [task] });
    } else {
      // Date-only tasks only ever fire on their exact due date. Anything
      // whose due date has already passed is backlog, not "due now".
      if (task.due.date > today) continue; // in the future

      const key = dailyKey(task.due.date, task.id);
      if (notifiedKeys.has(key)) continue;

      if (task.due.date < today) {
        // Missed entirely (backlog from before install, or a day the Cron
        // didn't run) - mark notified without sending.
        keysToMarkNotified.push(key);
        continue;
      }

      // task.due.date === today
      if (currentHour < settings.morningHour) continue; // too early

      dailyBundleTasks.push(task);
      dailyBundleKeys.push(key);
    }
  }

  if (dailyBundleTasks.length > 0) {
    notifications.push({
      type: "daily",
      keys: dailyBundleKeys,
      tasks: dailyBundleTasks,
    });
  }

  return { notifications, keysToMarkNotified };
}
