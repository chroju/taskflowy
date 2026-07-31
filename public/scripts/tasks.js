// Task view: pure logic helpers (grouping, formatting, URL conversion, swipe
// direction). DOM wiring lives in client.js; these are unit-testable in
// isolation (see src/test/tasks.test.ts).

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

// Start of the week (Monday) containing dateStr, as YYYY-MM-DD.
function startOfWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const delta = day === 0 ? -6 : 1 - day; // Monday-start week
  dt.setDate(dt.getDate() + delta);
  return localDateString(dt);
}

// Formats a due object { date, time } for badge display, e.g. "Jul 28",
// "Jul 28 14:30". Returns "" for null.
export function formatDueBadge(due) {
  if (!due) return "";
  const [y, m, d] = due.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = `${monthNames[dt.getMonth()]} ${dt.getDate()}`;
  return due.time ? `${label} ${due.time}` : label;
}

// Formats a unix-seconds createdAt timestamp as YYYY-MM-DD HH:mm (local).
export function formatCreatedAt(createdAtSec) {
  if (!createdAtSec) return "";
  const d = new Date(createdAtSec * 1000);
  if (isNaN(d.getTime())) return "";
  const date = localDateString(d);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

// ---- Grouping: due date ----

export const DUE_SECTIONS = ["overdue", "today", "tomorrow", "thisWeek", "later", "noDue"];

export const DUE_SECTION_LABELS = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  thisWeek: "This Week",
  later: "Later",
  noDue: "No Due Date",
};

// Classifies a task's due date relative to `todayStr` (YYYY-MM-DD) into one
// of DUE_SECTIONS.
export function classifyDue(due, todayStr = localDateString()) {
  if (!due) return "noDue";
  if (due.date < todayStr) return "overdue";
  if (due.date === todayStr) return "today";
  const tomorrow = addDays(todayStr, 1);
  if (due.date === tomorrow) return "tomorrow";
  // "This week" = through the end of the current week (Sunday), inclusive,
  // and after tomorrow (already handled above).
  const weekStart = startOfWeek(todayStr);
  const weekEnd = addDays(weekStart, 6);
  if (due.date <= weekEnd) return "thisWeek";
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

// Groups tasks by due-date section, returning an ordered array of
// { key, label, tasks } with each tasks array sorted by compareDue.
// Empty sections are omitted.
export function groupByDue(tasks, todayStr = localDateString()) {
  const buckets = {};
  for (const key of DUE_SECTIONS) buckets[key] = [];
  for (const task of tasks) {
    buckets[classifyDue(task.due, todayStr)].push(task);
  }
  return DUE_SECTIONS.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: DUE_SECTION_LABELS[key],
    tasks: buckets[key].slice().sort(compareDue),
  }));
}

// ---- Grouping: parent node ----

// Groups tasks by their nearest parent (last entry of parentPath, or
// parentId if the path is empty). Order follows first-seen appearance in
// the input list; each group's tasks keep the original relative order.
export function groupByParent(tasks) {
  const order = [];
  const buckets = new Map();
  for (const task of tasks) {
    const path = task.parentPath || [];
    const label = path.length > 0 ? path[path.length - 1] : "(no parent)";
    const key = task.parentId || "__none__";
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, path, tasks: [] });
      order.push(key);
    }
    buckets.get(key).tasks.push(task);
  }
  return order.map((key) => buckets.get(key));
}

// ---- Grouping: created date ----

export const CREATED_SECTIONS = ["today", "thisWeek", "thisMonth", "earlier"];

export const CREATED_SECTION_LABELS = {
  today: "Today",
  thisWeek: "This Week",
  thisMonth: "This Month",
  earlier: "Earlier",
};

function classifyCreated(createdAtSec, todayStr) {
  const dateStr = localDateString(new Date(createdAtSec * 1000));
  if (dateStr === todayStr) return "today";
  const weekStart = startOfWeek(todayStr);
  if (dateStr >= weekStart) return "thisWeek";
  const [y, m] = todayStr.split("-");
  if (dateStr.startsWith(`${y}-${m}`)) return "thisMonth";
  return "earlier";
}

// Groups tasks by createdAt section, newest first within each group.
export function groupByCreated(tasks, todayStr = localDateString()) {
  const buckets = {};
  for (const key of CREATED_SECTIONS) buckets[key] = [];
  for (const task of tasks) {
    buckets[classifyCreated(task.createdAt, todayStr)].push(task);
  }
  return CREATED_SECTIONS.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: CREATED_SECTION_LABELS[key],
    tasks: buckets[key].slice().sort((a, b) => b.createdAt - a.createdAt),
  }));
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

// Given a horizontal drag distance and a completion threshold (px),
// determines whether the drag should commit to "complete" (right swipe),
// "schedule" (left swipe), or null (snap back).
export function resolveSwipeAction(dx, threshold = 80) {
  if (dx >= threshold) return "complete";
  if (dx <= -threshold) return "schedule";
  return null;
}

// ---- Schedule shortcuts ----

// Builds the { date, time? } payload for the "today"/"tomorrow"/"nextMonday"
// quick options in the schedule bottom sheet.
export function scheduleShortcut(option, todayStr = localDateString()) {
  switch (option) {
    case "today":
      return { date: todayStr };
    case "tomorrow":
      return { date: addDays(todayStr, 1) };
    case "nextMonday":
      return { date: nextMonday(todayStr) };
    default:
      return null;
  }
}
