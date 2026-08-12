import { describe, it, expect } from "vitest";
import { buildSearchIndex } from "../api/search";
import type { ExportNode } from "../types";

function makeExportNode(overrides: Partial<ExportNode> = {}): ExportNode {
  return {
    id: "node-1",
    name: "Test Node",
    note: null,
    parent_id: null,
    priority: 0,
    createdAt: 100,
    modifiedAt: 100,
    completedAt: null,
    ...overrides,
  };
}

describe("buildSearchIndex", () => {
  it("maps every node, tasks and notes alike", () => {
    const nodes = [
      makeExportNode({ id: "t1", name: "Buy milk", data: { layoutMode: "todo" } }),
      makeExportNode({ id: "m1", name: "Meeting memo", note: "agenda" }),
    ];
    const items = buildSearchIndex(nodes);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: "t1", todo: true, completed: false });
    expect(items[1]).toMatchObject({ id: "m1", todo: false, note: "agenda" });
  });

  it("strips <time> markup into plainName and parses it as due", () => {
    const nodes = [
      makeExportNode({
        id: "t1",
        name: 'Report <time startYear="2026" startMonth="8" startDay="15">Aug 15, 2026</time>',
        data: { layoutMode: "todo" },
      }),
    ];
    const [item] = buildSearchIndex(nodes);
    expect(item.plainName).toBe("Report");
    expect(item.due).toEqual({ date: "2026-08-15", time: null });
  });

  it("marks completion from completedAt or the completed flag", () => {
    const nodes = [
      makeExportNode({ id: "a", completedAt: 123 }),
      makeExportNode({ id: "b", completed: true }),
      makeExportNode({ id: "c" }),
    ];
    const items = buildSearchIndex(nodes);
    expect(items.map((i) => i.completed)).toEqual([true, true, false]);
  });

  it("passes parent_id through as parentId for client-side path building", () => {
    const nodes = [
      makeExportNode({ id: "root", name: "Root" }),
      makeExportNode({ id: "child", name: "Child", parent_id: "root" }),
    ];
    const items = buildSearchIndex(nodes);
    expect(items[0].parentId).toBeNull();
    expect(items[1].parentId).toBe("root");
  });
});
