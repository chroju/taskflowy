import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../../src/index";
import type { WorkflowyNode, ExportNode } from "../types";

const mockGetNodes = vi.fn();
const mockCreateNode = vi.fn();
const mockGetNode = vi.fn();
const mockCompleteNode = vi.fn();
const mockUncompleteNode = vi.fn();
const mockNodesExport = vi.fn();
const mockUpdateNode = vi.fn();
const mockDeleteNode = vi.fn();
const mockGetCalendarNodes = vi.fn();

vi.mock("../api/workflowy-v1", () => ({
  WorkflowyClient: vi.fn().mockImplementation(() => ({
    getNodes: mockGetNodes,
    createNode: mockCreateNode,
    getNode: mockGetNode,
    completeNode: mockCompleteNode,
    uncompleteNode: mockUncompleteNode,
    nodesExport: mockNodesExport,
    updateNode: mockUpdateNode,
    deleteNode: mockDeleteNode,
    getCalendarNodes: mockGetCalendarNodes,
  })),
}));

vi.mock("../api/crypto", () => ({
  decrypt: vi.fn().mockResolvedValue("test-api-key"),
  encrypt: vi.fn().mockResolvedValue("encrypted"),
}));

const { mockSendPush } = vi.hoisted(() => ({ mockSendPush: vi.fn() }));
vi.mock("../api/push", () => ({
  sendPush: mockSendPush,
}));

// Minimal in-memory KV mock, fresh per test via beforeEach reset.
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

function makeNode(overrides: Partial<WorkflowyNode> = {}): WorkflowyNode {
  return {
    id: "node-1",
    name: "Test Node",
    note: null,
    priority: 0,
    createdAt: 0,
    modifiedAt: 0,
    completedAt: null,
    ...overrides,
  };
}

function makeExportNode(overrides: Partial<ExportNode> = {}): ExportNode {
  return {
    id: "node-1",
    name: "Test Node",
    note: null,
    parent_id: null,
    priority: 0,
    createdAt: 0,
    modifiedAt: 0,
    completedAt: null,
    ...overrides,
  };
}

function makeRequest(path: string, options: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...options,
    headers: {
      "Cookie": "auth=encrypted-token",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

let testKv = makeKvNamespace();

const testEnv = {
  ENCRYPTION_KEY: "test-key",
  ALLOWED_ORIGINS: "http://localhost",
  VAPID_PUBLIC_KEY: "test-vapid-public",
  VAPID_PRIVATE_KEY: "test-vapid-private",
  VAPID_SUBJECT: "mailto:test@example.com",
  get KV() {
    return testKv;
  },
};

beforeEach(() => {
  testKv = makeKvNamespace();
});

describe("POST /api/auth", () => {
  it("sets an auth cookie and returns ok", async () => {
    const req = new Request("http://localhost/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "my-key" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("auth=");
  });

  it("returns 400 when apiKey is missing", async () => {
    const req = new Request("http://localhost/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/check", () => {
  it("returns authenticated true with a valid cookie", async () => {
    const req = makeRequest("/api/auth/check");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { authenticated: boolean };
    expect(data.authenticated).toBe(true);
  });

  it("returns authenticated false without a cookie", async () => {
    const req = new Request("http://localhost/api/auth/check");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { authenticated: boolean };
    expect(data.authenticated).toBe(false);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the auth cookie", async () => {
    const req = makeRequest("/api/auth/logout", { method: "POST" });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("auth=;");
  });
});

describe("GET /api/nodes", () => {
  beforeEach(() => {
    mockGetNodes.mockReset();
  });

  it("returns nodes for a given parent_id", async () => {
    mockGetNodes.mockResolvedValue([makeNode({ id: "n1" })]);
    const req = makeRequest("/api/nodes?parent_id=parent-1");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as WorkflowyNode[];
    expect(res.status).toBe(200);
    expect(data[0].id).toBe("n1");
    expect(mockGetNodes).toHaveBeenCalledWith("parent-1");
  });

  it("defaults parent_id to 'None'", async () => {
    mockGetNodes.mockResolvedValue([]);
    const req = makeRequest("/api/nodes");
    await app.fetch(req, testEnv);
    expect(mockGetNodes).toHaveBeenCalledWith("None");
  });
});

describe("POST /api/send", () => {
  beforeEach(() => {
    mockCreateNode.mockReset();
    mockCreateNode.mockResolvedValue({ item_id: "created-id" });
  });

  it("creates node under 'today' for calendar target", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "calendar", name: "Hello", note: "world" }),
    });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { item_id: string };

    expect(res.status).toBe(200);
    expect(data.item_id).toBe("created-id");
    expect(mockCreateNode).toHaveBeenCalledTimes(1);
    expect(mockCreateNode).toHaveBeenCalledWith("today", "Hello", "world");
  });

  it("creates node under parentId for node target", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "node", parentId: "parent-1", name: "Hello" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    expect(mockCreateNode).toHaveBeenCalledWith("parent-1", "Hello", undefined);
  });

  it("returns 400 when parentId is missing for node target", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "node", name: "Hello" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
    expect(mockCreateNode).not.toHaveBeenCalled();
  });

  it("returns 400 for unknown targetType", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "inbox", name: "Hello" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
    expect(mockCreateNode).not.toHaveBeenCalled();
  });

  it("propagates layoutMode to createNode when provided", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "calendar", name: "Hello", layoutMode: "todo" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    const [, , , , layoutMode] = mockCreateNode.mock.calls[0];
    expect(layoutMode).toBe("todo");
  });

  it("does not affect existing calls when layoutMode is not provided", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "calendar", name: "Hello" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    expect(mockCreateNode).toHaveBeenCalledWith("today", "Hello", undefined);
  });

  it("propagates position to createNode when provided", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "node", parentId: "parent-1", name: "Hello", position: "top" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    expect(mockCreateNode).toHaveBeenCalledWith("parent-1", "Hello", undefined, "top", undefined);
  });

  it("propagates position together with layoutMode", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "calendar", name: "Hello", position: "bottom", layoutMode: "todo" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    expect(mockCreateNode).toHaveBeenCalledWith("today", "Hello", undefined, "bottom", "todo");
  });

  it("returns 400 for an invalid position", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "calendar", name: "Hello", position: "middle" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
    expect(mockCreateNode).not.toHaveBeenCalled();
  });
});

describe("POST /api/send (calendar day)", () => {
  beforeEach(() => {
    mockCreateNode.mockReset();
    mockCreateNode.mockResolvedValue({ item_id: "created-id" });
  });

  it.each(["tomorrow", "next_week", "2026-08-15"])(
    "creates node under the given day key %s",
    async (day) => {
      const req = makeRequest("/api/send", {
        method: "POST",
        body: JSON.stringify({ targetType: "calendar", day, name: "Hello" }),
      });
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(200);
      expect(mockCreateNode).toHaveBeenCalledWith(day, "Hello", undefined);
    }
  );

  it("defaults to 'today' when day is omitted", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "calendar", name: "Hello" }),
    });
    await app.fetch(req, testEnv);
    expect(mockCreateNode).toHaveBeenCalledWith("today", "Hello", undefined);
  });

  it("returns 400 for an invalid day key", async () => {
    const req = makeRequest("/api/send", {
      method: "POST",
      body: JSON.stringify({ targetType: "calendar", day: "yesterday", name: "Hello" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
    expect(mockCreateNode).not.toHaveBeenCalled();
  });
});

describe("GET /api/daily", () => {
  beforeEach(() => {
    mockGetCalendarNodes.mockReset();
  });

  it("returns day groups scanned from local_date", async () => {
    mockGetCalendarNodes.mockImplementation(async (key: string) =>
      key === "2026-08-08" ? [makeNode({ id: "d1", name: "Memo" })] : []
    );
    const req = makeRequest("/api/daily?local_date=2026-08-08");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as Array<{ date: string; items: Array<{ id: string }> }>;

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].date).toBe("2026-08-08");
    expect(data[0].items[0].id).toBe("d1");
  });

  it("returns 400 without a date anchor", async () => {
    const req = makeRequest("/api/daily");
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed anchor", async () => {
    const req = makeRequest("/api/daily?before_date=08-01");
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/nodes/:id/children", () => {
  beforeEach(() => {
    mockGetNodes.mockReset();
  });

  it("returns children mapped to view items", async () => {
    mockGetNodes.mockResolvedValue([
      makeNode({ id: "c1", name: "A task", data: { layoutMode: "todo" }, completedAt: 5 }),
      makeNode({ id: "c2", name: "A memo", note: "body" }),
    ]);
    const req = makeRequest("/api/nodes/parent-1/children");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { items: Array<{ id: string; todo: boolean; completed: boolean }> };

    expect(res.status).toBe(200);
    expect(mockGetNodes).toHaveBeenCalledWith("parent-1");
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({ id: "c1", todo: true, completed: true });
    expect(data.items[1]).toMatchObject({ id: "c2", todo: false, completed: false });
  });

  it("returns 404 when the node no longer exists", async () => {
    mockGetNodes.mockRejectedValue(new Error("Workflowy API error 404: not found"));
    const req = makeRequest("/api/nodes/gone/children");
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/nodes/:id/complete", () => {
  beforeEach(() => {
    mockCompleteNode.mockReset();
  });

  it("calls completeNode and returns ok", async () => {
    mockCompleteNode.mockResolvedValue(undefined);
    const req = makeRequest("/api/nodes/node-abc/complete", { method: "POST" });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockCompleteNode).toHaveBeenCalledWith("node-abc");
  });
});

describe("POST /api/nodes/:id/uncomplete", () => {
  beforeEach(() => {
    mockUncompleteNode.mockReset();
  });

  it("calls uncompleteNode and returns ok", async () => {
    mockUncompleteNode.mockResolvedValue(undefined);
    const req = makeRequest("/api/nodes/node-abc/uncomplete", { method: "POST" });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUncompleteNode).toHaveBeenCalledWith("node-abc");
  });
});

describe("GET /api/tasks", () => {
  beforeEach(() => {
    mockNodesExport.mockReset();
  });

  it("returns extracted tasks from nodesExport", async () => {
    mockNodesExport.mockResolvedValue([
      makeExportNode({ id: "a", name: "Todo task", data: { layoutMode: "todo" } }),
      makeExportNode({ id: "b", name: "Not a task", data: { layoutMode: "bullets" } }),
    ]);

    const req = makeRequest("/api/tasks");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { tasks: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].id).toBe("a");
  });

  it("includes completed todo tasks with a completed flag", async () => {
    mockNodesExport.mockResolvedValue([
      makeExportNode({ id: "a", name: "Open task", data: { layoutMode: "todo" } }),
      makeExportNode({ id: "b", name: "Done task", data: { layoutMode: "todo" }, completedAt: 123 }),
    ]);

    const req = makeRequest("/api/tasks");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { tasks: Array<{ id: string; completed: boolean }> };

    expect(res.status).toBe(200);
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks.find((t) => t.id === "a")?.completed).toBe(false);
    expect(data.tasks.find((t) => t.id === "b")?.completed).toBe(true);
  });

  it("returns 429 with an error message when Workflowy rate-limits nodes-export", async () => {
    mockNodesExport.mockRejectedValue(new Error("Workflowy API error 429: rate limited"));

    const req = makeRequest("/api/tasks");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(data.error).toMatch(/429/);
  });

  it("propagates other errors as 500", async () => {
    mockNodesExport.mockRejectedValue(new Error("Workflowy API error 500: boom"));

    const req = makeRequest("/api/tasks");
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/nodes/:id", () => {
  beforeEach(() => {
    mockDeleteNode.mockReset();
  });

  it("calls deleteNode and returns ok", async () => {
    mockDeleteNode.mockResolvedValue(undefined);
    const req = makeRequest("/api/nodes/node-abc", { method: "DELETE" });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDeleteNode).toHaveBeenCalledWith("node-abc");
  });
});

describe("POST /api/nodes/:id/schedule", () => {
  beforeEach(() => {
    mockGetNode.mockReset();
    mockUpdateNode.mockReset();
  });

  it("updates the node name with a new time markup for date only", async () => {
    mockGetNode.mockResolvedValue(makeNode({ id: "node-abc", name: "Buy milk" }));
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/schedule", {
      method: "POST",
      body: JSON.stringify({ date: "2026-07-28" }),
    });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUpdateNode).toHaveBeenCalledWith(
      "node-abc",
      { name: expect.stringContaining('startYear="2026" startMonth="7" startDay="28"') }
    );
  });

  it("updates the node name with a time markup including time", async () => {
    mockGetNode.mockResolvedValue(makeNode({ id: "node-abc", name: "Meeting" }));
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/schedule", {
      method: "POST",
      body: JSON.stringify({ date: "2026-07-28", time: "14:30" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    const [, fields] = mockUpdateNode.mock.calls[0];
    expect(fields.name).toContain('startHour="14" startMinute="30"');
  });

  it("replaces existing time markup rather than duplicating it", async () => {
    mockGetNode.mockResolvedValue(
      makeNode({
        id: "node-abc",
        name: 'Buy milk <time startYear="2025" startMonth="1" startDay="1">Wed, Jan 1, 2025</time>',
      })
    );
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/schedule", {
      method: "POST",
      body: JSON.stringify({ date: "2026-07-28" }),
    });
    await app.fetch(req, testEnv);

    const [, fields] = mockUpdateNode.mock.calls[0];
    expect(fields.name).toContain('startYear="2026"');
    expect((fields.name.match(/<time/g) || []).length).toBe(1);
  });

  it("returns 400 for malformed date", async () => {
    const req = makeRequest("/api/nodes/node-abc/schedule", {
      method: "POST",
      body: JSON.stringify({ date: "not-a-date" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("returns 400 when date is missing", async () => {
    const req = makeRequest("/api/nodes/node-abc/schedule", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("returns 404 when the node does not exist", async () => {
    mockGetNode.mockResolvedValue(null);

    const req = makeRequest("/api/nodes/node-abc/schedule", {
      method: "POST",
      body: JSON.stringify({ date: "2026-07-28" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(404);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });
});

describe("POST /api/nodes/:id/schedule (clear)", () => {
  beforeEach(() => {
    mockGetNode.mockReset();
    mockUpdateNode.mockReset();
  });

  it("strips the time markup when date is null", async () => {
    mockGetNode.mockResolvedValue(
      makeNode({
        id: "node-abc",
        name: 'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>',
      })
    );
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/schedule", {
      method: "POST",
      body: JSON.stringify({ date: null }),
    });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUpdateNode).toHaveBeenCalledWith("node-abc", { name: "Buy milk" });
  });
});

describe("POST /api/nodes/:id/note", () => {
  beforeEach(() => {
    mockUpdateNode.mockReset();
  });

  it("updates the node note", async () => {
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/note", {
      method: "POST",
      body: JSON.stringify({ note: "buy at the corner store" }),
    });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUpdateNode).toHaveBeenCalledWith("node-abc", { note: "buy at the corner store" });
  });

  it("accepts an empty string to clear the note", async () => {
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/note", {
      method: "POST",
      body: JSON.stringify({ note: "" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    expect(mockUpdateNode).toHaveBeenCalledWith("node-abc", { note: "" });
  });

  it("rejects a non-string note", async () => {
    const req = makeRequest("/api/nodes/node-abc/note", {
      method: "POST",
      body: JSON.stringify({ note: 42 }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(400);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });
});

describe("POST /api/nodes/:id/name", () => {
  beforeEach(() => {
    mockGetNode.mockReset();
    mockUpdateNode.mockReset();
  });

  it("updates the node name", async () => {
    mockGetNode.mockResolvedValue(makeNode({ id: "node-abc", name: "Buy milk" }));
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/name", {
      method: "POST",
      body: JSON.stringify({ name: "Buy soy milk" }),
    });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUpdateNode).toHaveBeenCalledWith("node-abc", { name: "Buy soy milk" });
  });

  it("preserves the embedded time markup", async () => {
    mockGetNode.mockResolvedValue(
      makeNode({
        id: "node-abc",
        name: 'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>',
      })
    );
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/name", {
      method: "POST",
      body: JSON.stringify({ name: "Buy soy milk" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    expect(mockUpdateNode).toHaveBeenCalledWith("node-abc", {
      name: 'Buy soy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>',
    });
  });

  it("rejects a non-string name", async () => {
    const req = makeRequest("/api/nodes/node-abc/name", {
      method: "POST",
      body: JSON.stringify({ name: 42 }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(400);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("rejects a blank name", async () => {
    const req = makeRequest("/api/nodes/node-abc/name", {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(400);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("returns 404 when the node does not exist", async () => {
    mockGetNode.mockResolvedValue(null);

    const req = makeRequest("/api/nodes/node-abc/name", {
      method: "POST",
      body: JSON.stringify({ name: "Buy soy milk" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(404);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });
});

describe("POST /api/nodes/:id/layout", () => {
  beforeEach(() => {
    mockUpdateNode.mockReset();
  });

  it("turns a note into a todo", async () => {
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/layout", {
      method: "POST",
      body: JSON.stringify({ todo: true }),
    });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUpdateNode).toHaveBeenCalledWith("node-abc", { layoutMode: "todo" });
  });

  it("turns a todo back into a note", async () => {
    mockUpdateNode.mockResolvedValue(undefined);

    const req = makeRequest("/api/nodes/node-abc/layout", {
      method: "POST",
      body: JSON.stringify({ todo: false }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(200);
    expect(mockUpdateNode).toHaveBeenCalledWith("node-abc", { layoutMode: "bullets" });
  });

  it("rejects a non-boolean todo", async () => {
    const req = makeRequest("/api/nodes/node-abc/layout", {
      method: "POST",
      body: JSON.stringify({ todo: "yes" }),
    });
    const res = await app.fetch(req, testEnv);

    expect(res.status).toBe(400);
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });
});

describe("auth mirrors the encrypted API key into KV", () => {
  it("stores the encrypted key in KV on /api/auth", async () => {
    const req = new Request("http://localhost/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "my-key" }),
    });
    await app.fetch(req, testEnv);
    expect(testKv._store.get("auth:apikey")).toBe("encrypted");
  });

  it("removes the KV mirror on logout", async () => {
    testKv._store.set("auth:apikey", "encrypted");
    const req = makeRequest("/api/auth/logout", { method: "POST" });
    await app.fetch(req, testEnv);
    expect(testKv._store.has("auth:apikey")).toBe(false);
  });
});

describe("GET /api/push/vapid-public-key", () => {
  it("returns the configured VAPID public key", async () => {
    const req = makeRequest("/api/push/vapid-public-key");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { publicKey: string };
    expect(data.publicKey).toBe("test-vapid-public");
  });
});

describe("POST /api/push/subscribe", () => {
  it("stores a new subscription", async () => {
    const sub = {
      endpoint: "https://push.example.com/a",
      expirationTime: null,
      keys: { auth: "auth-key", p256dh: "p256dh-key" },
    };
    const req = makeRequest("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(sub),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const stored = JSON.parse(testKv._store.get("push:subscriptions") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].endpoint).toBe(sub.endpoint);
  });

  it("replaces a subscription with the same endpoint instead of duplicating", async () => {
    const sub = {
      endpoint: "https://push.example.com/a",
      expirationTime: null,
      keys: { auth: "auth-key", p256dh: "p256dh-key" },
    };
    await app.fetch(
      makeRequest("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
      testEnv
    );
    await app.fetch(
      makeRequest("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ ...sub, keys: { auth: "new-auth", p256dh: "new-p256dh" } }),
      }),
      testEnv
    );

    const stored = JSON.parse(testKv._store.get("push:subscriptions") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].keys.auth).toBe("new-auth");
  });

  it("returns 400 for a malformed subscription", async () => {
    const req = makeRequest("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: "https://push.example.com/a" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/push/unsubscribe", () => {
  it("removes a subscription by endpoint", async () => {
    testKv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
        { endpoint: "https://b", expirationTime: null, keys: { auth: "b", p256dh: "b" } },
      ])
    );
    const req = makeRequest("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: "https://a" }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const stored = JSON.parse(testKv._store.get("push:subscriptions") || "[]");
    expect(stored.map((s: { endpoint: string }) => s.endpoint)).toEqual(["https://b"]);
  });

  it("returns 400 when endpoint is missing", async () => {
    const req = makeRequest("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/push/test", () => {
  beforeEach(() => {
    mockSendPush.mockReset();
  });

  it("returns 400 when there are no subscriptions", async () => {
    const req = makeRequest("/api/push/test", { method: "POST" });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });

  it("sends a test push to every stored subscription", async () => {
    testKv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
        { endpoint: "https://b", expirationTime: null, keys: { auth: "b", p256dh: "b" } },
      ])
    );
    mockSendPush.mockResolvedValue({ ok: true, status: 201, expired: false });

    const req = makeRequest("/api/push/test", { method: "POST" });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { results: Array<{ ok: boolean }> };

    expect(res.status).toBe(200);
    expect(mockSendPush).toHaveBeenCalledTimes(2);
    expect(data.results).toHaveLength(2);
  });

  it("drops a subscription from storage when the push service reports it expired", async () => {
    testKv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
      ])
    );
    mockSendPush.mockResolvedValue({ ok: false, status: 410, expired: true });

    const req = makeRequest("/api/push/test", { method: "POST" });
    await app.fetch(req, testEnv);

    const stored = JSON.parse(testKv._store.get("push:subscriptions") || "[]");
    expect(stored).toHaveLength(0);
  });

  it("reports a per-subscription error without failing the whole request", async () => {
    testKv._store.set(
      "push:subscriptions",
      JSON.stringify([
        { endpoint: "https://a", expirationTime: null, keys: { auth: "a", p256dh: "a" } },
      ])
    );
    mockSendPush.mockRejectedValue(new Error("network error"));

    const req = makeRequest("/api/push/test", { method: "POST" });
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { results: Array<{ ok: boolean; error?: string }> };

    expect(res.status).toBe(200);
    expect(data.results[0].ok).toBe(false);
    expect(data.results[0].error).toMatch(/network error/);
  });
});

describe("GET /api/notification-settings", () => {
  it("returns default settings when nothing is stored", async () => {
    const req = makeRequest("/api/notification-settings");
    const res = await app.fetch(req, testEnv);
    const data = (await res.json()) as { morningHour: number };
    expect(data).toEqual({ morningHour: 9 });
  });
});

describe("PUT /api/notification-settings", () => {
  it("persists a new morningHour", async () => {
    const req = makeRequest("/api/notification-settings", {
      method: "PUT",
      body: JSON.stringify({ morningHour: 7 }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);
    expect(testKv._store.get("notification:settings")).toBe(JSON.stringify({ morningHour: 7 }));
  });

  it("returns 400 for an out-of-range hour", async () => {
    const req = makeRequest("/api/notification-settings", {
      method: "PUT",
      body: JSON.stringify({ morningHour: 24 }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-integer hour", async () => {
    const req = makeRequest("/api/notification-settings", {
      method: "PUT",
      body: JSON.stringify({ morningHour: 7.5 }),
    });
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });
});

describe("recur endpoints", () => {
  beforeEach(() => {
    mockGetNode.mockReset();
    mockUpdateNode.mockReset();
    mockUpdateNode.mockResolvedValue(undefined);
  });

  it("GET /api/recur returns stored rules", async () => {
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "daily" }) }),
      testEnv
    );
    const res = await app.fetch(makeRequest("/api/recur"), testEnv);
    const data = (await res.json()) as { rules: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(data.rules).toEqual({ n1: { freq: "daily" } });
  });

  it("PUT /api/recur/:id appends the #recurring tag to the node's note", async () => {
    mockGetNode.mockResolvedValue(makeNode({ id: "n1", note: "memo" }));
    const res = await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "daily" }) }),
      testEnv
    );
    expect(res.status).toBe(200);
    expect(mockUpdateNode).toHaveBeenCalledWith("n1", { note: "memo\n#recurring" });
  });

  it("PUT /api/recur/:id leaves an already tagged note alone", async () => {
    mockGetNode.mockResolvedValue(makeNode({ id: "n1", note: "memo\n#recurring" }));
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "daily" }) }),
      testEnv
    );
    expect(mockUpdateNode).not.toHaveBeenCalled();
  });

  it("DELETE /api/recur/:id removes the #recurring tag from the note", async () => {
    mockGetNode.mockResolvedValue(makeNode({ id: "n1", note: "memo\n#recurring" }));
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "daily" }) }),
      testEnv
    );
    mockUpdateNode.mockClear();
    await app.fetch(makeRequest("/api/recur/n1", { method: "DELETE" }), testEnv);
    expect(mockUpdateNode).toHaveBeenCalledWith("n1", { note: "memo" });
  });

  it("DELETE /api/recur/:id still removes the rule when the node is gone", async () => {
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "daily" }) }),
      testEnv
    );
    mockUpdateNode.mockClear();
    mockGetNode.mockResolvedValue(null);
    const res = await app.fetch(makeRequest("/api/recur/n1", { method: "DELETE" }), testEnv);
    expect(res.status).toBe(200);
    expect(mockUpdateNode).not.toHaveBeenCalled();
    const list = await app.fetch(makeRequest("/api/recur"), testEnv);
    expect(((await list.json()) as { rules: object }).rules).toEqual({});
  });

  it("PUT /api/recur/:id rejects an invalid rule", async () => {
    const res = await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "weekly", weekday: 9 }) }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it("DELETE /api/recur/:id removes the rule", async () => {
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "daily" }) }),
      testEnv
    );
    const res = await app.fetch(makeRequest("/api/recur/n1", { method: "DELETE" }), testEnv);
    expect(res.status).toBe(200);
    const list = await app.fetch(makeRequest("/api/recur"), testEnv);
    expect(((await list.json()) as { rules: object }).rules).toEqual({});
  });

  it("POST /api/recur/:id/complete rolls the due date forward and records the completion", async () => {
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "weekly", weekday: 1 }) }),
      testEnv
    );
    mockGetNode.mockResolvedValue(
      makeNode({
        id: "n1",
        name: 'Trash <time startYear="2026" startMonth="8" startDay="9" startHour="8" startMinute="0">x</time>',
      })
    );
    // 2026-08-09 is a Sunday; next Monday is 08-10
    const res = await app.fetch(
      makeRequest("/api/recur/n1/complete", { method: "POST", body: JSON.stringify({ localDate: "2026-08-09" }) }),
      testEnv
    );
    const data = (await res.json()) as { due: { date: string; time: string | null } };
    expect(res.status).toBe(200);
    expect(data.due).toEqual({ date: "2026-08-10", time: "08:00" });
    const [nodeId, fields] = mockUpdateNode.mock.calls[0];
    expect(nodeId).toBe("n1");
    expect(fields.name).toContain('startDay="10"');
    expect(fields.name).toContain('startHour="8"');

    const stored = JSON.parse(testKv._store.get("recur:completions") as string);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      nodeId: "n1",
      date: "2026-08-09",
      prevDue: { date: "2026-08-09", time: "08:00" },
    });
  });

  it("POST /api/recur/:id/complete returns 404 without a rule", async () => {
    const res = await app.fetch(
      makeRequest("/api/recur/n1/complete", { method: "POST", body: JSON.stringify({ localDate: "2026-08-09" }) }),
      testEnv
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/recur/:id/complete rejects a bad localDate", async () => {
    const res = await app.fetch(
      makeRequest("/api/recur/n1/complete", { method: "POST", body: JSON.stringify({ localDate: "tomorrow" }) }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/recur/:id/uncomplete restores the previous due date and drops the record", async () => {
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "weekly", weekday: 1 }) }),
      testEnv
    );
    mockGetNode.mockResolvedValue(
      makeNode({ id: "n1", name: 'Trash <time startYear="2026" startMonth="8" startDay="9">x</time>' })
    );
    await app.fetch(
      makeRequest("/api/recur/n1/complete", { method: "POST", body: JSON.stringify({ localDate: "2026-08-09" }) }),
      testEnv
    );
    mockUpdateNode.mockClear();
    mockGetNode.mockResolvedValue(
      makeNode({ id: "n1", name: 'Trash <time startYear="2026" startMonth="8" startDay="10">x</time>' })
    );

    const res = await app.fetch(
      makeRequest("/api/recur/n1/uncomplete", { method: "POST", body: JSON.stringify({ date: "2026-08-09" }) }),
      testEnv
    );
    const data = (await res.json()) as { due: { date: string } | null };
    expect(res.status).toBe(200);
    expect(data.due).toEqual({ date: "2026-08-09", time: null });
    const [, fields] = mockUpdateNode.mock.calls[0];
    expect(fields.name).toContain('startDay="9"');
    expect(JSON.parse(testKv._store.get("recur:completions") as string)).toEqual([]);
  });

  it("POST /api/recur/:id/uncomplete strips the markup when the task had no due date", async () => {
    await app.fetch(
      makeRequest("/api/recur/n1", { method: "PUT", body: JSON.stringify({ freq: "daily" }) }),
      testEnv
    );
    mockGetNode.mockResolvedValue(makeNode({ id: "n1", name: "Habit" }));
    await app.fetch(
      makeRequest("/api/recur/n1/complete", { method: "POST", body: JSON.stringify({ localDate: "2026-08-09" }) }),
      testEnv
    );
    mockUpdateNode.mockClear();
    mockGetNode.mockResolvedValue(
      makeNode({ id: "n1", name: 'Habit <time startYear="2026" startMonth="8" startDay="10">x</time>' })
    );

    const res = await app.fetch(makeRequest("/api/recur/n1/uncomplete", { method: "POST", body: "{}" }), testEnv);
    const data = (await res.json()) as { due: null };
    expect(data.due).toBeNull();
    const [, fields] = mockUpdateNode.mock.calls[0];
    expect(fields.name).toBe("Habit");
  });

  it("POST /api/recur/:id/uncomplete returns 404 without a record", async () => {
    const res = await app.fetch(makeRequest("/api/recur/n1/uncomplete", { method: "POST", body: "{}" }), testEnv);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/tasks with recurrence", () => {
  beforeEach(() => {
    mockNodesExport.mockReset();
  });

  it("merges virtual completed tasks from completion records", async () => {
    testKv._store.set(
      "recur:completions",
      JSON.stringify([
        { nodeId: "n1", date: "2026-08-09", prevDue: { date: "2026-08-09", time: null }, completedAt: 123 },
      ])
    );
    mockNodesExport.mockResolvedValue([
      makeExportNode({ id: "n1", name: "Trash", data: { layoutMode: "todo" } }),
    ]);
    const res = await app.fetch(makeRequest("/api/tasks"), testEnv);
    const data = (await res.json()) as { tasks: Array<{ id: string; virtual?: boolean; completed: boolean }> };
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks[1]).toMatchObject({ id: "n1", virtual: true, completed: true, recurDate: "2026-08-09" });
  });
});
