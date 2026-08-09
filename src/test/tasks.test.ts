import { describe, it, expect } from "vitest";
import { extractTasks, mergeRecurCompletions } from "../api/tasks";
import type { ExportNode, Task, RecurCompletion } from "../types";

function makeNode(overrides: Partial<ExportNode> = {}): ExportNode {
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

describe("extractTasks", () => {
  it("extracts nodes with layoutMode 'todo' that are not completed", () => {
    const nodes = [
      makeNode({ id: "a", name: "Todo task", data: { layoutMode: "todo" } }),
      makeNode({ id: "b", name: "Bullet item", data: { layoutMode: "bullets" } }),
      makeNode({ id: "c", name: "No layout" }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("a");
  });

  it("excludes tasks with completedAt set", () => {
    const nodes = [
      makeNode({ id: "a", data: { layoutMode: "todo" }, completedAt: 123 }),
      makeNode({ id: "b", data: { layoutMode: "todo" }, completedAt: null }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks.map((t) => t.id)).toEqual(["b"]);
  });

  it("excludes tasks with completed flag set even if completedAt is null", () => {
    const nodes = [
      makeNode({ id: "a", data: { layoutMode: "todo" }, completed: true, completedAt: null }),
      makeNode({ id: "b", data: { layoutMode: "todo" }, completed: false, completedAt: null }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks.map((t) => t.id)).toEqual(["b"]);
  });

  it("builds plainName by stripping time markup", () => {
    const nodes = [
      makeNode({
        id: "a",
        name: 'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>',
        data: { layoutMode: "todo" },
      }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks[0].plainName).toBe("Buy milk");
    expect(tasks[0].name).toBe(
      'Buy milk <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>'
    );
  });

  it("parses due date and time from name", () => {
    const nodes = [
      makeNode({
        id: "a",
        name: '<time startYear="2026" startMonth="7" startDay="28" startHour="14" startMinute="30">x</time>',
        data: { layoutMode: "todo" },
      }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks[0].due).toEqual({ date: "2026-07-28", time: "14:30" });
  });

  it("sets due to null when there is no time markup", () => {
    const nodes = [makeNode({ id: "a", name: "No date", data: { layoutMode: "todo" } })];
    const tasks = extractTasks(nodes);
    expect(tasks[0].due).toBeNull();
  });

  it("builds parentPath root-first, excluding the task itself", () => {
    const nodes = [
      makeNode({ id: "root", name: "Root", parent_id: null }),
      makeNode({ id: "mid", name: "Mid", parent_id: "root" }),
      makeNode({ id: "task1", name: "Leaf task", parent_id: "mid", data: { layoutMode: "todo" } }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks[0].parentPath).toEqual(["Root", "Mid"]);
  });

  it("strips time markup from parent names in parentPath", () => {
    const nodes = [
      makeNode({
        id: "root",
        name: 'Daily <time startYear="2026" startMonth="7" startDay="28">Tue, Jul 28, 2026</time>',
        parent_id: null,
      }),
      makeNode({ id: "task1", name: "Leaf task", parent_id: "root", data: { layoutMode: "todo" } }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks[0].parentPath).toEqual(["Daily"]);
  });

  it("truncates parentPath when a parent is not found in the node list", () => {
    const nodes = [
      makeNode({ id: "mid", name: "Mid", parent_id: "missing-root" }),
      makeNode({ id: "task1", name: "Leaf task", parent_id: "mid", data: { layoutMode: "todo" } }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks[0].parentPath).toEqual(["Mid"]);
  });

  it("returns empty parentPath for a root-level task", () => {
    const nodes = [makeNode({ id: "task1", name: "Leaf task", parent_id: null, data: { layoutMode: "todo" } })];
    const tasks = extractTasks(nodes);
    expect(tasks[0].parentPath).toEqual([]);
  });

  it("carries over id, note, parentId, and createdAt", () => {
    const nodes = [
      makeNode({
        id: "task1",
        name: "Leaf task",
        note: "some note",
        parent_id: "parent-1",
        createdAt: 12345,
        data: { layoutMode: "todo" },
      }),
    ];
    const tasks = extractTasks(nodes);
    expect(tasks[0]).toMatchObject({
      id: "task1",
      note: "some note",
      parentId: "parent-1",
      createdAt: 12345,
    });
  });

  it("returns an empty array when there are no matching nodes", () => {
    expect(extractTasks([])).toEqual([]);
  });

  it("marks incomplete tasks with completed: false", () => {
    const nodes = [makeNode({ id: "a", data: { layoutMode: "todo" } })];
    expect(extractTasks(nodes)[0].completed).toBe(false);
  });

  it("includes completed todo nodes when includeCompleted is set", () => {
    const nodes = [
      makeNode({ id: "a", data: { layoutMode: "todo" }, completedAt: 123 }),
      makeNode({ id: "b", data: { layoutMode: "todo" }, completed: true, completedAt: null }),
      makeNode({ id: "c", data: { layoutMode: "todo" } }),
      makeNode({ id: "d", data: { layoutMode: "bullets" }, completedAt: 123 }),
    ];
    const tasks = extractTasks(nodes, { includeCompleted: true });
    expect(tasks.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
    expect(tasks.find((t) => t.id === "a")?.completed).toBe(true);
    expect(tasks.find((t) => t.id === "b")?.completed).toBe(true);
    expect(tasks.find((t) => t.id === "c")?.completed).toBe(false);
  });
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "n1",
    name: "Task",
    plainName: "Task",
    note: null,
    parentId: "p1",
    parentPath: ["Parent"],
    createdAt: 0,
    completedAt: null,
    due: { date: "2026-08-16", time: null },
    completed: false,
    ...overrides,
  };
}

function makeCompletion(overrides: Partial<RecurCompletion> = {}): RecurCompletion {
  return {
    nodeId: "n1",
    date: "2026-08-09",
    prevDue: { date: "2026-08-09", time: null },
    completedAt: 1_786_000_000,
    ...overrides,
  };
}

describe("mergeRecurCompletions", () => {
  it("appends a virtual completed task built from the live task", () => {
    const tasks = [makeTask()];
    const merged = mergeRecurCompletions(tasks, [makeCompletion()]);
    expect(merged).toHaveLength(2);
    const virtual = merged[1];
    expect(virtual.virtual).toBe(true);
    expect(virtual.recurDate).toBe("2026-08-09");
    expect(virtual.completed).toBe(true);
    expect(virtual.completedAt).toBe(1_786_000_000);
    // Shows the due date it was completed against, not the rolled-forward one
    expect(virtual.due).toEqual({ date: "2026-08-09", time: null });
    expect(virtual.plainName).toBe("Task");
    expect(virtual.parentPath).toEqual(["Parent"]);
  });

  it("leaves the live task untouched", () => {
    const tasks = [makeTask()];
    const merged = mergeRecurCompletions(tasks, [makeCompletion()]);
    expect(merged[0].completed).toBe(false);
    expect(merged[0].virtual).toBeUndefined();
    expect(merged[0].due).toEqual({ date: "2026-08-16", time: null });
  });

  it("skips records whose node is no longer a task", () => {
    const merged = mergeRecurCompletions([makeTask({ id: "other" })], [makeCompletion()]);
    expect(merged).toHaveLength(1);
  });

  it("returns the input unchanged when there are no records", () => {
    const tasks = [makeTask()];
    expect(mergeRecurCompletions(tasks, [])).toEqual(tasks);
  });
});
