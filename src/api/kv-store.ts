import type { PushSubscriptionRecord, NotificationSettings } from "../types";

// --- KV key layout ---
// push:subscriptions      -> JSON array of PushSubscriptionRecord
// notification:settings   -> JSON NotificationSettings
// notification:notified:<key> -> "1", TTL 30 days (existence = already notified)
// auth:apikey             -> encrypted API key string (mirrors the auth cookie,
//                             so the Cron trigger can call the Workflowy API
//                             without a browser request in flight)

const SUBSCRIPTIONS_KEY = "push:subscriptions";
const SETTINGS_KEY = "notification:settings";
const NOTIFIED_PREFIX = "notification:notified:";
const API_KEY_KEY = "auth:apikey";

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
