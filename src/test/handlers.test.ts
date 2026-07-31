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

vi.mock("../api/workflowy-v1", () => ({
  WorkflowyClient: vi.fn().mockImplementation(() => ({
    getNodes: mockGetNodes,
    createNode: mockCreateNode,
    getNode: mockGetNode,
    completeNode: mockCompleteNode,
    uncompleteNode: mockUncompleteNode,
    nodesExport: mockNodesExport,
    updateNode: mockUpdateNode,
  })),
}));

vi.mock("../api/crypto", () => ({
  decrypt: vi.fn().mockResolvedValue("test-api-key"),
  encrypt: vi.fn().mockResolvedValue("encrypted"),
}));

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

const testEnv = {
  ENCRYPTION_KEY: "test-key",
  ALLOWED_ORIGINS: "http://localhost",
};

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
