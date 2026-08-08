// Task view: pure logic helpers (title normalization, grouping, formatting,
// swipe judgement). DOM wiring lives in client.js; these are unit-testable in
// isolation (see src/test/task-view.test.ts).

// ---- Date helpers ----

// Returns local YYYY-MM-DD for a given Date (defaults to now).
export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Adds `days` calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD.
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateString(dt);
}

// Next Monday after `dateStr` (never returns the same day; if dateStr is a
// Monday, returns the Monday one week later).
export function nextMonday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Sun..6=Sat
  let delta = (1 - day + 7) % 7;
  if (delta === 0) delta = 7;
  dt.setDate(dt.getDate() + delta);
  return localDateString(dt);
}

// Whole-day difference between a YYYY-MM-DD date and today (negative = past).
function dayDiff(dateStr, todayStr) {
  const toUtc = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(dateStr) - toUtc(todayStr)) / 86400000);
}

// ---- Title normalization ----

// Workflowy node names can contain inline HTML (<a>, <b>, ...), a literal
// leading timestamp ("19:44 ..."), and emoji. The design shows a clean plain
// title; links stay reachable via the Workflowy link in the detail sheet.
export function normalizeTitle(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/<[^>]*>/g, " ");
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  s = s.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^\d{1,2}:\d{2}\s+/, "");
  return s;
}

// ---- Due formatting ----

// List display: MM/DD, or YY/MM/DD only for next year and later. No relative
// wording; overdue is signalled by color alone.
export function formatDueShort(due, todayStr = localDateString()) {
  if (!due) return "";
  const [y, m, d] = due.date.split("-");
  const currentYear = Number(todayStr.split("-")[0]);
  return Number(y) > currentYear ? `${y.slice(2)}/${m}/${d}` : `${m}/${d}`;
}

// Detail sheet display: date plus time when present, 期限なし otherwise.
export function formatDueDetail(due, todayStr = localDateString()) {
  if (!due) return "期限なし";
  const label = formatDueShort(due, todayStr);
  return due.time ? `${label} ${due.time}` : label;
}

const JP_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// Header status row: "8月1日（土）".
export function formatHeaderDate(dateStr = localDateString()) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = JP_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日（${weekday}）`;
}

// Relative "last synced" label for the settings sync card.
export function formatSyncAgo(nowMs, syncMs) {
  if (syncMs == null) return "未同期";
  const diff = Math.max(0, nowMs - syncMs);
  if (diff < 60_000) return "たった今同期";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分前に同期`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 時間前に同期`;
  return `${Math.floor(diff / 86400_000)} 日前に同期`;
}

// ---- Grouping: due date ----

// Classifies a task's due date relative to `todayStr` (YYYY-MM-DD).
// "thisWeek" means within the next 7 days (after tomorrow).
export function classifyDue(due, todayStr = localDateString()) {
  if (!due) return "noDue";
  const d = dayDiff(due.date, todayStr);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 7) return "thisWeek";
  return "later";
}

// Sorts tasks within a due-date grouping: by date+time ascending; tasks
// without a time on a given date sort after timed tasks on the same date;
// tasks with no due date at all sort last (stable by original order).
export function compareDue(a, b) {
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  if (a.due.date !== b.due.date) return a.due.date < b.due.date ? -1 : 1;
  const at = a.due.time;
  const bt = b.due.time;
  if (at === bt) return 0;
  if (!at) return 1;
  if (!bt) return -1;
  return at < bt ? -1 : 1;
}

const DUE_SECTION_LABELS = {
  overdue: "期限切れ",
  today: "今日",
  tomorrow: "明日",
  thisWeek: "今週",
  later: "それ以降",
  noDue: "いつか（期限なし）",
};

const VIEW_SECTIONS = {
  today: ["overdue", "today"],
  due: ["overdue", "today", "tomorrow", "thisWeek", "later", "noDue"],
};

// Groups tasks for the Today / Deadlines views, returning an ordered array
// of { key, label, overdue, tasks }. Empty sections are omitted. The Today
// view shows overdue and today only. Completed tasks are excluded unless
// showCompleted, in which case those belonging to the view's sections form
// a trailing 完了 group.
export function groupTasksForView(tasks, view, todayStr = localDateString(), showCompleted = false) {
  const sections = VIEW_SECTIONS[view] || VIEW_SECTIONS.due;
  const buckets = {};
  const done = [];
  for (const key of sections) buckets[key] = [];
  for (const task of tasks) {
    const key = classifyDue(task.due, todayStr);
    if (!buckets[key]) continue; // outside this view's sections
    if (task.completed) done.push(task);
    else buckets[key].push(task);
  }
  const groups = sections
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({
      key,
      label: DUE_SECTION_LABELS[key],
      overdue: key === "overdue",
      tasks: buckets[key].slice().sort(compareDue),
    }));
  if (showCompleted && done.length > 0) {
    groups.push({ key: "done", label: "完了", overdue: false, tasks: done.slice().sort(compareDue) });
  }
  return groups;
}

// ---- Grouping: nodes ----

const NO_NODE_LABEL = "（ノードなし）";

// Summarizes tasks per nearest parent node for the Nodes list: label,
// done/total counts, and whether any incomplete task is overdue. Order
// follows first-seen appearance in the input list.
export function summarizeNodes(tasks, todayStr = localDateString()) {
  const order = [];
  const byKey = new Map();
  for (const task of tasks) {
    const key = task.parentId || "__none__";
    if (!byKey.has(key)) {
      const path = task.parentPath || [];
      const label = path.length > 0 ? normalizeTitle(path[path.length - 1]) || NO_NODE_LABEL : NO_NODE_LABEL;
      byKey.set(key, { key, label, total: 0, done: 0, hasOverdue: false, tasks: [] });
      order.push(key);
    }
    const node = byKey.get(key);
    node.total += 1;
    node.tasks.push(task);
    if (task.completed) {
      node.done += 1;
    } else if (task.due && classifyDue(task.due, todayStr) === "overdue") {
      node.hasOverdue = true;
    }
  }
  return order.map((key) => byKey.get(key));
}

// Hides nodes whose todos are all completed, unless `showFinished` is set.
// A node with no todos at all is never hidden -- "nothing done" is not the
// same as "everything done".
export function filterFinishedNodes(nodes, showFinished) {
  if (showFinished) return nodes;
  return nodes.filter((node) => node.total === 0 || node.done < node.total);
}

// Splits a single node's tasks into 未完了 / 完了 groups (empty omitted).
// showCompleted=false drops the 完了 group entirely.
export function groupNodeTasks(tasks, showCompleted = true) {
  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const groups = [];
  if (open.length) groups.push({ key: "open", label: "未完了", overdue: false, tasks: open });
  if (showCompleted && done.length) groups.push({ key: "done", label: "完了", overdue: false, tasks: done });
  return groups;
}

// Progress donut (20x20 SVG, r=8, stroke-dasharray = circumference * ratio).
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 8;

export function donutDash(done, total) {
  const ratio = total > 0 ? done / total : 0;
  return `${(DONUT_CIRCUMFERENCE * ratio).toFixed(1)} ${DONUT_CIRCUMFERENCE.toFixed(1)}`;
}

// ---- Workflowy URL ----

// Converts a Workflowy node UUID into its short-form app URL. Workflowy
// links use the last 12 hex characters of the UUID with hyphens removed.
export function workflowyUrl(nodeId) {
  const stripped = String(nodeId).replace(/-/g, "");
  const shortId = stripped.slice(-12);
  return `https://workflowy.com/#/${shortId}`;
}

// ---- Swipe gesture ----

// Classifies a touch drag into a direction, given the total movement and a
// minimum threshold. Returns "horizontal", "vertical", or null (below
// threshold on both axes -- not yet a determined gesture).
export function swipeDirection(dx, dy, threshold = 10) {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

// Given a horizontal drag distance and a commit threshold (px), determines
// whether the drag commits to "complete" (right swipe), "delete" (left
// swipe), or null (snap back).
export function resolveSwipeAction(dx, threshold = 72) {
  if (dx >= threshold) return "complete";
  if (dx <= -threshold) return "delete";
  return null;
}

// Drag distance is clamped so the row never travels further than ±130px.
export function clampDx(dx, max = 130) {
  return Math.max(-max, Math.min(max, dx));
}

// ---- Due shortcuts ----

// Builds the { date } payload for the 今日/明日/来週 chips (add sheet) and
// the 明日へ/来週へ buttons (detail sheet). "none" and unknown options
// return null (no due date).
export function dueShortcut(option, todayStr = localDateString()) {
  switch (option) {
    case "today":
      return { date: todayStr };
    case "tomorrow":
      return { date: addDays(todayStr, 1) };
    case "week":
      return { date: nextMonday(todayStr) };
    default:
      return null;
  }
}
