// Daily notes: probing Workflowy native calendar nodes by date key
// (YYYY-MM-DD, 404 = no note for that day) and collecting recent days into
// groups for the Daily view. Ported from Jotflowy's /history calendar branch.
// All date arithmetic is done in UTC so results are timezone-independent.

import type { WorkflowyClient } from "./workflowy-v1";
import type { WorkflowyNode, ViewItem, DailyGroup } from "../types";
import { parseTimeMarkup, stripTimeMarkup } from "./time-markup";

export function addDays(iso: string, n: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateKeysBack(start: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(addDays(start, -i));
  }
  return keys;
}

// Common item shape for the Daily and registered-node views: tasks and plain
// notes share it, distinguished by `todo`.
export function toViewItem(node: WorkflowyNode): ViewItem {
  return {
    id: node.id,
    name: node.name,
    plainName: stripTimeMarkup(node.name),
    note: node.note,
    todo: node.data?.layoutMode === "todo",
    completed: node.completedAt != null,
    due: parseTimeMarkup(node.name),
    createdAt: node.createdAt,
  };
}

export const DAILY_GROUP_LIMIT = 7;
// Cap per request; keep probes well under the Cloudflare Workers
// subrequest limit (50).
const MAX_SCAN_DAYS = 31;
const PROBE_BATCH_SIZE = 7;

// Collects up to DAILY_GROUP_LIMIT non-empty day groups, scanning backward.
// Initial load starts at localDate + 1 to cover client/Workflowy timezone
// skew; pagination continues from beforeDate - 1.
export async function collectDailyHistory(
  client: Pick<WorkflowyClient, "getCalendarNodes">,
  anchor: { localDate?: string; beforeDate?: string }
): Promise<DailyGroup[]> {
  const start = anchor.beforeDate
    ? addDays(anchor.beforeDate, -1)
    : addDays(anchor.localDate as string, 1);

  const collected: { date: string; items: ViewItem[] }[] = [];
  let scanned = 0;
  while (scanned < MAX_SCAN_DAYS && collected.length < DAILY_GROUP_LIMIT) {
    const batchKeys = dateKeysBack(
      addDays(start, -scanned),
      Math.min(PROBE_BATCH_SIZE, MAX_SCAN_DAYS - scanned)
    );
    const children = await Promise.all(batchKeys.map((key) => client.getCalendarNodes(key)));
    batchKeys.forEach((key, i) => {
      if (children[i].length > 0) {
        collected.push({ date: key, items: children[i].map(toViewItem) });
      }
    });
    scanned += batchKeys.length;
  }

  // Filled the page => likely more below; scan cap reached => end of scroll.
  const hasMore = collected.length >= DAILY_GROUP_LIMIT;
  const groups: DailyGroup[] = collected
    .slice(0, DAILY_GROUP_LIMIT)
    .map((group) => ({ date: group.date, items: group.items, hasMore: false }));
  if (groups.length > 0) groups[groups.length - 1].hasMore = hasMore;
  return groups;
}
