import type { PushSubscriptionRecord, NotificationSettings, RecurCompletion } from "../types";
import type { RecurRule } from "./recur";
import { addDaysStr } from "./recur";

// --- KV key layout ---
// push:subscriptions      -> JSON array of PushSubscriptionRecord
// notification:settings   -> JSON NotificationSettings
// notification:notified:<key> -> "1", TTL 30 days (existence = already notified)
// auth:apikey             -> encrypted API key string (mirrors the auth cookie,
//                             so the Cron trigger can call the Workflowy API
//                             without a browser request in flight)
// recur:rules             -> JSON map of node id -> RecurRule (single key: the
//                             rule set is small and is always read as a whole)
// recur:completions       -> JSON array of RecurCompletion, pruned to the last
//                             90 days on write (feeds only the 完了 views)

const SUBSCRIPTIONS_KEY = "push:subscriptions";
const SETTINGS_KEY = "notification:settings";
const NOTIFIED_PREFIX = "notification:notified:";
const API_KEY_KEY = "auth:apikey";
const RECUR_RULES_KEY = "recur:rules";
const RECUR_COMPLETIONS_KEY = "recur:completions";

const RECUR_COMPLETION_RETENTION_DAYS = 90;

const NOTIFIED_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const DEFAULT_SETTINGS: NotificationSettings = { morningHour: 9 };

// --- Push subscriptions ---

export async function getSubscriptions(kv: KVNamespace): Promise<PushSubscriptionRecord[]> {
  const raw = await kv.get(SUBSCRIPTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSubscriptions(kv: KVNamespace, subs: PushSubscriptionRecord[]): Promise<void> {
  await kv.put(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

export async function addOrReplaceSubscription(
  kv: KVNamespace,
  subscription: PushSubscriptionRecord
): Promise<void> {
  const subs = await getSubscriptions(kv);
  const filtered = subs.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push(subscription);
  await saveSubscriptions(kv, filtered);
}

export async function removeSubscription(kv: KVNamespace, endpoint: string): Promise<void> {
  const subs = await getSubscriptions(kv);
  await saveSubscriptions(
    kv,
    subs.filter((s) => s.endpoint !== endpoint)
  );
}

// --- Notification settings ---

export async function getNotificationSettings(kv: KVNamespace): Promise<NotificationSettings> {
  const raw = await kv.get(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return { morningHour: typeof parsed.morningHour === "number" ? parsed.morningHour : DEFAULT_SETTINGS.morningHour };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function setNotificationSettings(
  kv: KVNamespace,
  settings: NotificationSettings
): Promise<void> {
  await kv.put(SETTINGS_KEY, JSON.stringify(settings));
}

// --- Notified-key bookkeeping ---

// When `candidateKeys` is omitted, this only checks nothing (there is no KV
// "list all matching keys with a value" primitive worth relying on here);
// callers doing the Cron sweep always pass the candidate keys they're about
// to evaluate, so this returns the subset of those that are already marked.
export async function getNotifiedKeys(
  kv: KVNamespace,
  candidateKeys: string[] = []
): Promise<Set<string>> {
  const found = new Set<string>();
  await Promise.all(
    candidateKeys.map(async (key) => {
      const val = await kv.get(NOTIFIED_PREFIX + key);
      if (val !== null) found.add(key);
    })
  );
  return found;
}

export async function markNotified(kv: KVNamespace, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      kv.put(NOTIFIED_PREFIX + key, "1", { expirationTtl: NOTIFIED_TTL_SECONDS })
    )
  );
}

// --- Recurrence rules ---

export async function getRecurRules(kv: KVNamespace): Promise<Record<string, RecurRule>> {
  const raw = await kv.get(RECUR_RULES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function setRecurRule(kv: KVNamespace, nodeId: string, rule: RecurRule): Promise<void> {
  const rules = await getRecurRules(kv);
  rules[nodeId] = rule;
  await kv.put(RECUR_RULES_KEY, JSON.stringify(rules));
}

export async function deleteRecurRule(kv: KVNamespace, nodeId: string): Promise<void> {
  const rules = await getRecurRules(kv);
  if (!(nodeId in rules)) return;
  delete rules[nodeId];
  await kv.put(RECUR_RULES_KEY, JSON.stringify(rules));
}

// --- Recurrence completion records ---

export async function getRecurCompletions(kv: KVNamespace): Promise<RecurCompletion[]> {
  const raw = await kv.get(RECUR_COMPLETIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// One completion per node per day: a same-day re-completion replaces the
// existing record. Records older than the retention window (relative to the
// new record's date, so no clock access is needed here) are pruned on write.
export async function addRecurCompletion(kv: KVNamespace, record: RecurCompletion): Promise<void> {
  const cutoff = addDaysStr(record.date, -RECUR_COMPLETION_RETENTION_DAYS);
  const records = (await getRecurCompletions(kv)).filter(
    (r) => r.date >= cutoff && !(r.nodeId === record.nodeId && r.date === record.date)
  );
  records.push(record);
  await kv.put(RECUR_COMPLETIONS_KEY, JSON.stringify(records));
}

// Removes the record for a node (matching `date` when given, otherwise the
// most recent one) and returns it, so the caller can restore prevDue.
export async function removeRecurCompletion(
  kv: KVNamespace,
  nodeId: string,
  date?: string
): Promise<RecurCompletion | null> {
  const records = await getRecurCompletions(kv);
  const candidates = records.filter(
    (r) => r.nodeId === nodeId && (date === undefined || r.date === date)
  );
  if (candidates.length === 0) return null;
  const target = candidates.reduce((a, b) => (b.completedAt >= a.completedAt ? b : a));
  await kv.put(RECUR_COMPLETIONS_KEY, JSON.stringify(records.filter((r) => r !== target)));
  return target;
}

// --- Stored (encrypted) API key, for the Cron trigger ---

export async function getStoredApiKey(kv: KVNamespace): Promise<string | null> {
  return kv.get(API_KEY_KEY);
}

export async function setStoredApiKey(kv: KVNamespace, encryptedApiKey: string): Promise<void> {
  await kv.put(API_KEY_KEY, encryptedApiKey);
}

export async function deleteStoredApiKey(kv: KVNamespace): Promise<void> {
  await kv.delete(API_KEY_KEY);
}
