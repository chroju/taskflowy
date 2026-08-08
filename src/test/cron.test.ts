import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ExportNode } from "../types";

const mockNodesExport = vi.fn();
vi.mock("../api/workflowy-v1", () => ({
  WorkflowyClient: vi.fn().mockImplementation(() => ({
    nodesExport: mockNodesExport,
  })),
}));

vi.mock("../api/crypto", () => ({
  decrypt: vi.fn().mockResolvedValue("test-api-key"),
}));

const { mockSendPush } = vi.hoisted(() => ({ mockSendPush: vi.fn() }));
vi.mock("../api/push", () => ({
  sendPush: mockSendPush,
}));

import { runNotificationSweep } from "../api/cron";

function makeKvNamespace() {
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
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

function makeEnv(kv: KVNamespace): Env {
  return {
    ENCRYPTION_KEY: "test-key",
    ALLOWED_ORIGINS: "http://localhost",
    VAPID_PUBLIC_KEY: "pub",
    VAPID_PRIVATE_KEY: "priv",
    VAPID_SUBJECT: "mailto:test@example.com",
    KV: kv,
  };
}

function makeExportNode(overrides: Partial<ExportNode> = {}): ExportNode {
  return {
    id: "node-1",
    name: "Task",
    note: null,
    parent_id: null,
    priority: 0,
    createdAt: 0,
    modifiedAt: 0,
    completedAt: null,
    ...overrides,
  };
}

describe("runNotificationSweep", () => {
  let kv: ReturnType<typeof makeKvNamespace>;

  beforeEach(() => {
    kv = makeKvNamespace();
    mockNodesExport.mockReset();
    mockSendPush.mockReset();
    mockSendPush.mockResolvedValue({ ok: true, status: 201, expired: false });
  });

  it("does nothing when no API key is stored", async () => {
    const result = await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T06:00:00Z"));
    expect(result.skipped).toBe("no-api-key");
    expect(mockNodesExport).not.toHaveBeenCalled();
  });

  it("does nothing when there are no subscriptions", async () => {
    kv._store.set("auth:apikey", "encrypted-token");
    mockNodesExport.mockResolvedValue([
      makeExportNode({
        id: "t1",
        name: '<time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="0">x</time>',
        data: { layoutMode: "todo" },
      }),
    ]);

    const result = await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T06:00:00Z"));
    expect(result.skipped).toBe("no-subscriptions");
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("sends a push for a due timed task and records it as notified", async () => {
    kv._store.set("auth:apikey", "encrypted-token");
    kv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
      ])
    );
    mockNodesExport.mockResolvedValue([
      makeExportNode({
        id: "t1",
        name: 'Buy milk <time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="0">x</time>',
        data: { layoutMode: "todo" },
      }),
    ]);

    const result = await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T06:00:00Z"));

    expect(mockSendPush).toHaveBeenCalledTimes(1);
    const [, payload] = mockSendPush.mock.calls[0];
    expect(payload.title).toBe("Buy milk");
    expect(result.sent).toBe(1);
    expect(kv._store.has("notification:notified:t1:2026-07-28:14:00")).toBe(true);
  });

  it("does not send again once a key is recorded as notified", async () => {
    kv._store.set("auth:apikey", "encrypted-token");
    kv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
      ])
    );
    kv._store.set("notification:notified:t1:2026-07-28:14:00", "1");
    mockNodesExport.mockResolvedValue([
      makeExportNode({
        id: "t1",
        name: 'Buy milk <time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="0">x</time>',
        data: { layoutMode: "todo" },
      }),
    ]);

    const result = await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T06:00:00Z"));
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it("sends one bundled push for multiple date-only tasks due today", async () => {
    kv._store.set("auth:apikey", "encrypted-token");
    kv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
      ])
    );
    mockNodesExport.mockResolvedValue([
      makeExportNode({
        id: "t1",
        name: 'Task one <time startYear="2026" startMonth="7" startDay="28">x</time>',
        data: { layoutMode: "todo" },
      }),
      makeExportNode({
        id: "t2",
        name: 'Task two <time startYear="2026" startMonth="7" startDay="28">x</time>',
        data: { layoutMode: "todo" },
      }),
    ]);

    // 09:30 JST on 2026-07-28
    const result = await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T00:30:00Z"));

    expect(mockSendPush).toHaveBeenCalledTimes(1);
    const [, payload] = mockSendPush.mock.calls[0];
    expect(payload.title).toMatch(/2/);
    expect(payload.body).toContain("Task one");
    expect(payload.body).toContain("Task two");
    expect(result.sent).toBe(1);
    expect(kv._store.has("notification:notified:daily:2026-07-28:t1")).toBe(true);
    expect(kv._store.has("notification:notified:daily:2026-07-28:t2")).toBe(true);
  });

  it("sends to multiple subscriptions and drops expired ones", async () => {
    kv._store.set("auth:apikey", "encrypted-token");
    kv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
        { endpoint: "https://b", expirationTime: null, keys: { auth: "b", p256dh: "b" } },
      ])
    );
    mockNodesExport.mockResolvedValue([
      makeExportNode({
        id: "t1",
        name: 'Task <time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="0">x</time>',
        data: { layoutMode: "todo" },
      }),
    ]);
    mockSendPush
      .mockResolvedValueOnce({ ok: true, status: 201, expired: false })
      .mockResolvedValueOnce({ ok: false, status: 410, expired: true });

    await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T06:00:00Z"));

    const stored = JSON.parse(kv._store.get("push:subscriptions") || "[]");
    expect(stored.map((s: { endpoint: string }) => s.endpoint)).toEqual(["https://a"]);
  });

  it("folds long-overdue backlog into a single overdue digest instead of individual pushes", async () => {
    kv._store.set("auth:apikey", "encrypted-token");
    kv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
      ])
    );
    mockNodesExport.mockResolvedValue([
      makeExportNode({
        id: "old",
        name: 'Old task <time startYear="2026" startMonth="7" startDay="20" startHour="10" startMinute="0">x</time>',
        data: { layoutMode: "todo" },
      }),
    ]);

    const result = await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T06:00:00Z"));

    // One digest push, no per-task push burst.
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    const [, payload] = mockSendPush.mock.calls[0];
    expect(payload.title).toBe("Overdue tasks (1)");
    expect(payload.body).toContain("Old task");
    expect(result.sent).toBe(1);
    // The timed key is still recorded so the individual push never fires,
    // and the overdue key keeps today's digest from repeating.
    expect(kv._store.has("notification:notified:old:2026-07-20:10:00")).toBe(true);
    expect(kv._store.has("notification:notified:overdue:2026-07-28:old")).toBe(true);
  });

  it("does not repeat the overdue digest on a later sweep the same day", async () => {
    kv._store.set("auth:apikey", "encrypted-token");
    kv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
      ])
    );
    kv._store.set("notification:notified:old:2026-07-20:10:00", "1");
    kv._store.set("notification:notified:overdue:2026-07-28:old", "1");
    mockNodesExport.mockResolvedValue([
      makeExportNode({
        id: "old",
        name: 'Old task <time startYear="2026" startMonth="7" startDay="20" startHour="10" startMinute="0">x</time>',
        data: { layoutMode: "todo" },
      }),
    ]);

    const result = await runNotificationSweep(makeEnv(kv), new Date("2026-07-28T06:00:00Z"));
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });
});
