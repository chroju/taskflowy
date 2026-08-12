// Search view (Issue #9): Workflowy has no search API, so the search index
// is the whole nodes-export snapshot mapped to view items. The client
// fetches it once (60s cache, same as the task list) and runs full-text
// matching locally, so any number of queries fit within nodes-export's
// 1 req/min limit. Parent paths are not embedded here -- every node would
// repeat its ancestors' names -- the client rebuilds them from parentId.

import type { ExportNode, SearchIndexItem } from "../types";
import { parseTimeMarkup, stripTimeMarkup } from "./time-markup";

export function buildSearchIndex(nodes: ExportNode[]): SearchIndexItem[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    plainName: stripTimeMarkup(n.name),
    note: n.note,
    todo: n.data?.layoutMode === "todo",
    completed: n.completedAt != null || !!n.completed,
    due: parseTimeMarkup(n.name),
    createdAt: n.createdAt,
    parentId: n.parent_id,
  }));
}
