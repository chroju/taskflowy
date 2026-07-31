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
} from "../api/kv-store";
import type { PushSubscriptionRecord } from "../types";

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
