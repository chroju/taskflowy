import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSubscriptions,
  addOrReplaceSubscription,
  removeSubscription,
  getNotificationSettings,
  setNotificationSettings,
  getNotifiedKeys,
  markNotified,
  getStoredApiKey,
  setStoredApiKey,
  deleteStoredApiKey,
  getRecurRules,
  setRecurRule,
  deleteRecurRule,
  getRecurCompletions,
  addRecurCompletion,
  removeRecurCompletion,
} from "../api/kv-store";
import type { PushSubscriptionRecord, RecurCompletion } from "../types";

function makeSub(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    endpoint: "https://push.example.com/a",
    expirationTime: null,
    keys: { auth: "auth", p256dh: "p256dh" },
    ...overrides,
  };
}

function makeKvMock() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

describe("subscriptions", () => {
  let kv: ReturnType<typeof makeKvMock>;
  beforeEach(() => {
    kv = makeKvMock();
  });

  it("returns an empty list when nothing is stored", async () => {
    const subs = await getSubscriptions(kv as never);
    expect(subs).toEqual([]);
  });

  it("adds a subscription", async () => {
    await addOrReplaceSubscription(kv as never, makeSub({ endpoint: "https://a" }));
    const subs = await getSubscriptions(kv as never);
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe("https://a");
  });

  it("replaces an existing subscription with the same endpoint instead of duplicating", async () => {
    await addOrReplaceSubscription(kv as never, makeSub({ endpoint: "https://a", keys: { auth: "old", p256dh: "old" } }));
    await addOrReplaceSubscription(kv as never, makeSub({ endpoint: "https://a", keys: { auth: "new", p256dh: "new" } }));
    const subs = await getSubscriptions(kv as never);
    expect(subs).toHaveLength(1);
    expect(subs[0].keys.auth).toBe("new");
  });

  it("removes a subscription by endpoint", async () => {
    await addOrReplaceSubscription(kv as never, makeSub({ endpoint: "https://a" }));
    await addOrReplaceSubscription(kv as never, makeSub({ endpoint: "https://b" }));
    await removeSubscription(kv as never, "https://a");
    const subs = await getSubscriptions(kv as never);
    expect(subs.map((s) => s.endpoint)).toEqual(["https://b"]);
  });
});

describe("notification settings", () => {
  let kv: ReturnType<typeof makeKvMock>;
  beforeEach(() => {
    kv = makeKvMock();
  });

  it("defaults to morningHour 9 when nothing is stored", async () => {
    const settings = await getNotificationSettings(kv as never);
    expect(settings).toEqual({ morningHour: 9 });
  });

  it("persists and returns custom settings", async () => {
    await setNotificationSettings(kv as never, { morningHour: 7 });
    const settings = await getNotificationSettings(kv as never);
    expect(settings).toEqual({ morningHour: 7 });
  });
});

describe("notified keys", () => {
  let kv: ReturnType<typeof makeKvMock>;
  beforeEach(() => {
    kv = makeKvMock();
  });

  it("returns an empty set when nothing is notified", async () => {
    const keys = await getNotifiedKeys(kv as never);
    expect(keys.size).toBe(0);
  });

  it("marks keys as notified with a TTL and they show up in getNotifiedKeys", async () => {
    await markNotified(kv as never, ["k1", "k2"]);
    const keys = await getNotifiedKeys(kv as never, ["k1", "k2", "k3"]);
    expect(keys.has("k1")).toBe(true);
    expect(keys.has("k2")).toBe(true);
    expect(keys.has("k3")).toBe(false);
  });

  it("uses a 30-day TTL when marking notified", async () => {
    await markNotified(kv as never, ["k1"]);
    expect(kv.put).toHaveBeenCalledWith(
      expect.stringContaining("k1"),
      "1",
      expect.objectContaining({ expirationTtl: 60 * 60 * 24 * 30 })
    );
  });
});

describe("recur rules", () => {
  let kv: ReturnType<typeof makeKvMock>;
  beforeEach(() => {
    kv = makeKvMock();
  });

  it("returns an empty map when nothing is stored", async () => {
    expect(await getRecurRules(kv as never)).toEqual({});
  });

  it("sets and replaces a rule per node id", async () => {
    await setRecurRule(kv as never, "n1", { freq: "daily" });
    await setRecurRule(kv as never, "n2", { freq: "weekly", weekday: 1 });
    await setRecurRule(kv as never, "n1", { freq: "monthly", day: 5 });
    expect(await getRecurRules(kv as never)).toEqual({
      n1: { freq: "monthly", day: 5 },
      n2: { freq: "weekly", weekday: 1 },
    });
  });

  it("deletes a rule", async () => {
    await setRecurRule(kv as never, "n1", { freq: "daily" });
    await deleteRecurRule(kv as never, "n1");
    expect(await getRecurRules(kv as never)).toEqual({});
  });
});

function makeCompletion(overrides: Partial<RecurCompletion> = {}): RecurCompletion {
  return {
    nodeId: "n1",
    date: "2026-08-09",
    prevDue: { date: "2026-08-09", time: null },
    completedAt: 1_786_000_000,
    ...overrides,
  };
}

describe("recur completions", () => {
  let kv: ReturnType<typeof makeKvMock>;
  beforeEach(() => {
    kv = makeKvMock();
  });

  it("returns an empty list when nothing is stored", async () => {
    expect(await getRecurCompletions(kv as never)).toEqual([]);
  });

  it("adds completions", async () => {
    await addRecurCompletion(kv as never, makeCompletion({ nodeId: "n1" }));
    await addRecurCompletion(kv as never, makeCompletion({ nodeId: "n2" }));
    const records = await getRecurCompletions(kv as never);
    expect(records.map((r) => r.nodeId)).toEqual(["n1", "n2"]);
  });

  it("replaces a record for the same node and date instead of duplicating", async () => {
    await addRecurCompletion(kv as never, makeCompletion({ completedAt: 100 }));
    await addRecurCompletion(kv as never, makeCompletion({ completedAt: 200 }));
    const records = await getRecurCompletions(kv as never);
    expect(records).toHaveLength(1);
    expect(records[0].completedAt).toBe(200);
  });

  it("prunes records older than 90 days relative to the new record's date", async () => {
    await addRecurCompletion(kv as never, makeCompletion({ nodeId: "old", date: "2026-05-01" }));
    await addRecurCompletion(kv as never, makeCompletion({ nodeId: "kept", date: "2026-05-12" }));
    await addRecurCompletion(kv as never, makeCompletion({ nodeId: "new", date: "2026-08-09" }));
    const records = await getRecurCompletions(kv as never);
    expect(records.map((r) => r.nodeId)).toEqual(["kept", "new"]);
  });

  it("removes the record for a node and date, returning it", async () => {
    await addRecurCompletion(kv as never, makeCompletion({ date: "2026-08-08" }));
    await addRecurCompletion(kv as never, makeCompletion({ date: "2026-08-09" }));
    const removed = await removeRecurCompletion(kv as never, "n1", "2026-08-09");
    expect(removed?.date).toBe("2026-08-09");
    const records = await getRecurCompletions(kv as never);
    expect(records.map((r) => r.date)).toEqual(["2026-08-08"]);
  });

  it("removes the latest record for a node when no date is given", async () => {
    await addRecurCompletion(kv as never, makeCompletion({ date: "2026-08-08", completedAt: 100 }));
    await addRecurCompletion(kv as never, makeCompletion({ date: "2026-08-09", completedAt: 200 }));
    const removed = await removeRecurCompletion(kv as never, "n1");
    expect(removed?.date).toBe("2026-08-09");
  });

  it("returns null when there is nothing to remove", async () => {
    expect(await removeRecurCompletion(kv as never, "n1")).toBeNull();
  });
});

describe("stored API key", () => {
  let kv: ReturnType<typeof makeKvMock>;
  beforeEach(() => {
    kv = makeKvMock();
  });

  it("returns null when nothing is stored", async () => {
    const key = await getStoredApiKey(kv as never);
    expect(key).toBeNull();
  });

  it("stores and retrieves an encrypted API key", async () => {
    await setStoredApiKey(kv as never, "encrypted-value");
    const key = await getStoredApiKey(kv as never);
    expect(key).toBe("encrypted-value");
  });

  it("deletes the stored API key", async () => {
    await setStoredApiKey(kv as never, "encrypted-value");
    await deleteStoredApiKey(kv as never);
    const key = await getStoredApiKey(kv as never);
    expect(key).toBeNull();
  });
});
