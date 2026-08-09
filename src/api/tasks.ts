import type { ExportNode, Task, RecurCompletion } from "../types";
import { parseTimeMarkup, stripTimeMarkup } from "./time-markup";

// Root-first path of ancestor names, walking parent_id up until the root
// or until a parent id is missing from the node list (truncates there).
function buildParentPath(node: ExportNode, byId: Map<string, ExportNode>): string[] {
  const path: string[] = [];
  let current = node;
  while (current.parent_id) {
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    path.unshift(stripTimeMarkup(parent.name));
    current = parent;
  }
  return path;
}

export function extractTasks(
  nodes: ExportNode[],
  options: { includeCompleted?: boolean } = {}
): Task[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isCompleted = (n: ExportNode) => n.completedAt != null || !!n.completed;

  return nodes
    .filter((n) => n.data?.layoutMode === "todo" && (options.includeCompleted || !isCompleted(n)))
    .map((n) => ({
      id: n.id,
      name: n.name,
      plainName: stripTimeMarkup(n.name),
      note: n.note,
      parentId: n.parent_id,
      parentPath: buildParentPath(n, byId),
      createdAt: n.createdAt,
      completedAt: n.completedAt ?? null,
      due: parseTimeMarkup(n.name),
      completed: isCompleted(n),
    }));
}

// Appends virtual completed instances of recurring tasks. The Workflowy node
// of a recurring task is never completed (its due date just rolls forward),
// so the 完了 views are fed from RecurCompletion records instead: each record
// becomes a completed copy of the live task, dated by the record and showing
// prevDue (the due date it was completed against). Records whose node is no
// longer in the task list (deleted, or no longer a todo) are dropped.
export function mergeRecurCompletions(tasks: Task[], completions: RecurCompletion[]): Task[] {
  if (completions.length === 0) return tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const virtuals: Task[] = [];
  for (const record of completions) {
    const live = byId.get(record.nodeId);
    if (!live) continue;
    virtuals.push({
      ...live,
      completed: true,
      completedAt: record.completedAt,
      due: record.prevDue,
      virtual: true,
      recurDate: record.date,
    });
  }
  return [...tasks, ...virtuals];
}
