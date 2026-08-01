import type { ExportNode, Task } from "../types";
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
      due: parseTimeMarkup(n.name),
      completed: isCompleted(n),
    }));
}
