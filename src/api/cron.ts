import { WorkflowyClient } from "./workflowy-v1";
import { decrypt } from "./crypto";
import { extractTasks } from "./tasks";
import { selectDueNotifications, type NotificationPlan } from "./notify";
import { sendPush, type NotificationPayload } from "./push";
import {
  getStoredApiKey,
  getSubscriptions,
  removeSubscription,
  getNotificationSettings,
  getNotifiedKeys,
  markNotified,
} from "./kv-store";
import type { Env, Task } from "../types";

export interface NotificationSweepResult {
  skipped?: "no-api-key" | "no-subscriptions";
  sent: number;
}

const DAILY_BUNDLE_PREVIEW_LIMIT = 5;

function timedPayload(task: Task): NotificationPayload {
  return {
    title: task.plainName,
    body: task.parentPath.join(" / "),
    url: task.id,
  };
}

function dailyPayload(tasks: Task[]): NotificationPayload {
  const preview = tasks.slice(0, DAILY_BUNDLE_PREVIEW_LIMIT).map((t) => t.plainName);
  const remaining = tasks.length - preview.length;
  const body = remaining > 0 ? `${preview.join("\n")}\n…and ${remaining} more` : preview.join("\n");

  return {
    title: `Today's tasks (${tasks.length})`,
    body,
  };
}

function planKeys(plan: NotificationPlan): string[] {
  return plan.type === "timed" ? [plan.key] : plan.keys;
}

function planPayload(plan: NotificationPlan): NotificationPayload {
  return plan.type === "timed" ? timedPayload(plan.tasks[0]) : dailyPayload(plan.tasks);
}

// Collects every notification key a task could possibly produce right now,
// so we can ask KV in one batch which of them are already marked notified
// (selectDueNotifications needs the full notified-set up front, it doesn't
// do its own KV lookups).
function candidateKeysFor(tasks: Task[]): string[] {
  const keys: string[] = [];
  for (const task of tasks) {
    if (!task.due) continue;
    if (task.due.time) {
      keys.push(`${task.id}:${task.due.date}:${task.due.time}`);
    } else {
      keys.push(`daily:${task.due.date}:${task.id}`);
    }
  }
  return keys;
}

export async function runNotificationSweep(
  env: Env,
  now: Date
): Promise<NotificationSweepResult> {
  const encryptedApiKey = await getStoredApiKey(env.KV);
  if (!encryptedApiKey) return { skipped: "no-api-key", sent: 0 };

  const subscriptions = await getSubscriptions(env.KV);
  if (subscriptions.length === 0) return { skipped: "no-subscriptions", sent: 0 };

  const apiKey = await decrypt(encryptedApiKey, env.ENCRYPTION_KEY);
  const client = new WorkflowyClient(apiKey);
  const nodes = await client.nodesExport();
  const tasks = extractTasks(nodes);

  const settings = await getNotificationSettings(env.KV);
  const notifiedKeys = await getNotifiedKeys(env.KV, candidateKeysFor(tasks));
  const { notifications, keysToMarkNotified } = selectDueNotifications(
    tasks,
    now,
    settings,
    notifiedKeys
  );

  if (keysToMarkNotified.length > 0) {
    await markNotified(env.KV, keysToMarkNotified);
  }

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  let sent = 0;
  for (const plan of notifications) {
    const payload = planPayload(plan);
    let deliveredToAtLeastOne = false;

    for (const sub of subscriptions) {
      try {
        const result = await sendPush(sub, payload, vapid);
        if (result.expired) {
          await removeSubscription(env.KV, sub.endpoint);
        } else if (result.ok) {
          deliveredToAtLeastOne = true;
        }
      } catch {
        // Best-effort: one subscription's failure shouldn't block the
        // others or the notified-key bookkeeping for this plan.
      }
    }

    if (deliveredToAtLeastOne) {
      sent += 1;
      await markNotified(env.KV, planKeys(plan));
    }
  }

  return { sent };
}
