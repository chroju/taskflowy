import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkflowyClient } from "../api/workflowy-v1";
import type { WorkflowyNode } from "../types";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

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

function okResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe("WorkflowyClient", () => {
  const client = new WorkflowyClient("test-api-key");

  describe("getNodes", () => {
    it("returns nodes sorted by priority", async () => {
      const nodes = [
        makeNode({ id: "b", priority: 2 }),
        makeNode({ id: "a", priority: 1 }),
      ];
      mockFetch.mockReturnValue(okResponse({ nodes }));

      const result = await client.getNodes("parent-1");
      expect(result[0].id).toBe("a");
      expect(result[1].id).toBe("b");
    });

    it("calls correct endpoint with parent_id", async () => {
      mockFetch.mockReturnValue(okResponse({ nodes: [] }));
      await client.getNodes("my-parent");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("parent_id=my-parent"),
        expect.any(Object)
      );
    });

    it("throws on HTTP error", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(new Response("Not Found", { status: 404 }))
      );
      await expect(client.getNodes()).rejects.toThrow("404");
    });
  });

  describe("createNode", () => {
    it("sends correct request body", async () => {
      mockFetch.mockReturnValue(okResponse({ item_id: "new-id" }));
      await client.createNode("parent-1", "My Node", "my note", "top");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toMatchObject({
        parent_id: "parent-1",
        name: "My Node",
        note: "my note",
        position: "top",
      });
    });

    it("omits undefined note and position", async () => {
      mockFetch.mockReturnValue(okResponse({ item_id: "new-id" }));
      await client.createNode("parent-1", "My Node");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.note).toBeUndefined();
      expect(body.position).toBeUndefined();
    });
  });

  describe("getCalendarNodes", () => {
    it("returns nodes sorted by priority", async () => {
      const nodes = [
        makeNode({ id: "b", priority: 2 }),
        makeNode({ id: "a", priority: 1 }),
      ];
      mockFetch.mockReturnValue(okResponse({ nodes }));

      const result = await client.getCalendarNodes("2026-02-14");
      expect(result[0].id).toBe("a");
      expect(result[1].id).toBe("b");
    });

    it("returns empty array on 404 (calendar node not created yet)", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(
          new Response(JSON.stringify({ code: "not_found" }), { status: 404 })
        )
      );
      const result = await client.getCalendarNodes("1999-01-05");
      expect(result).toEqual([]);
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(new Response("Server Error", { status: 500 }))
      );
      await expect(client.getCalendarNodes("2026-02-14")).rejects.toThrow("500");
    });

    it("calls correct endpoint with date key as parent_id", async () => {
      mockFetch.mockReturnValue(okResponse({ nodes: [] }));
      await client.getCalendarNodes("2026-02-14");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("parent_id=2026-02-14"),
        expect.any(Object)
      );
    });
  });

  describe("getNode", () => {
    it("returns the node for a date key", async () => {
      mockFetch.mockReturnValue(
        okResponse({ node: makeNode({ id: "day-node-id" }) })
      );
      const result = await client.getNode("2026-02-14");
      expect(result?.id).toBe("day-node-id");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/nodes/2026-02-14"),
        expect.any(Object)
      );
    });

    it("returns null on 404", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(
          new Response(JSON.stringify({ code: "not_found" }), { status: 404 })
        )
      );
      const result = await client.getNode("1999-01-05");
      expect(result).toBeNull();
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(new Response("Server Error", { status: 500 }))
      );
      await expect(client.getNode("2026-02-14")).rejects.toThrow("500");
    });
  });

  describe("completeNode", () => {
    it("calls correct endpoint", async () => {
      mockFetch.mockReturnValue(okResponse({}));
      await client.completeNode("node-abc");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/nodes/node-abc/complete"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("uncompleteNode", () => {
    it("calls correct endpoint", async () => {
      mockFetch.mockReturnValue(okResponse({}));
      await client.uncompleteNode("node-abc");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/nodes/node-abc/uncomplete"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("nodesExport", () => {
    it("calls the nodes-export endpoint and returns nodes", async () => {
      const nodes = [
        { id: "a", name: "A", note: null, parent_id: null, priority: 0, createdAt: 0, modifiedAt: 0, completedAt: null },
      ];
      mockFetch.mockReturnValue(okResponse({ nodes }));

      const result = await client.nodesExport();
      expect(result).toEqual(nodes);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/nodes-export"),
        expect.any(Object)
      );
    });

    it("throws a status-identifiable error on 429", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(new Response("Too Many Requests", { status: 429 }))
      );
      await expect(client.nodesExport()).rejects.toThrow("429");
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(new Response("Server Error", { status: 500 }))
      );
      await expect(client.nodesExport()).rejects.toThrow("500");
    });
  });

  describe("updateNode", () => {
    it("sends a POST to /nodes/:id with the provided fields", async () => {
      mockFetch.mockReturnValue(okResponse({ status: "ok" }));
      await client.updateNode("node-abc", { name: "New name" });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/nodes/node-abc");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body).toEqual({ name: "New name" });
    });

    it("supports updating layoutMode", async () => {
      mockFetch.mockReturnValue(okResponse({ status: "ok" }));
      await client.updateNode("node-abc", { layoutMode: "todo" });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual({ layoutMode: "todo" });
    });

    it("omits fields that are not provided", async () => {
      mockFetch.mockReturnValue(okResponse({ status: "ok" }));
      await client.updateNode("node-abc", { name: "New name" });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.layoutMode).toBeUndefined();
    });

    it("throws on HTTP error", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve(new Response("Server Error", { status: 500 }))
      );
      await expect(client.updateNode("node-abc", { name: "x" })).rejects.toThrow("500");
    });
  });

  describe("createNode with layoutMode", () => {
    it("includes layoutMode in the request body when provided", async () => {
      mockFetch.mockReturnValue(okResponse({ item_id: "new-id" }));
      await client.createNode("parent-1", "My Task", undefined, undefined, "todo");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.layoutMode).toBe("todo");
    });

    it("omits layoutMode when not provided", async () => {
      mockFetch.mockReturnValue(okResponse({ item_id: "new-id" }));
      await client.createNode("parent-1", "My Node");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.layoutMode).toBeUndefined();
    });
  });
});
