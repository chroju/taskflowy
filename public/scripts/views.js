// Views / places: pure logic for the view bar (Tasks / Daily / registered
// nodes), the settings 場所 list, the Daily view, and the compose sheet's
// destination. DOM wiring lives in client.js; unit tests are in
// src/test/views.test.ts.

import { localDateString, addDays, nextMonday } from "./tasks.js";

// ---- Places ----

// A place is both a view (when inView) and a write destination:
//   { id, kind: 'builtin' | 'daily' | 'node', name, ref?, inView }
// kind 'builtin' is the Tasks view; 'daily' the native calendar; 'node' a
// user-registered Workflowy node (ref = node id).

export function defaultPlaces() {
  return [
    { id: "tasks", kind: "builtin", name: "Tasks", inView: true },
    { id: "daily", kind: "daily", name: "Daily", inView: true },
  ];
}

// Upgrades stored settings to the places model. Legacy node destinations
// become registered places (viewable and writable); legacy calendar
// destinations are covered by the built-in Daily place. The previously
// selected destination is preserved as the compose default (lastDest).
export function migratePlaces(settings) {
  if (Array.isArray(settings.places) && settings.places.length > 0) {
    return { places: settings.places, lastDest: settings.lastDest || null };
  }

  const places = defaultPlaces();
  const dests = Array.isArray(settings.destinations) ? settings.destinations : [];
  for (const d of dests) {
    if (d.type === "node" && d.nodeId) {
      places.push({ id: d.id, kind: "node", name: d.name, ref: d.nodeId, inView: true });
    }
  }

  let lastDest = null;
  const selected = dests.find((d) => d.id === settings.selectedDestinationId);
  if (selected) {
    lastDest = selected.type === "calendar"
      ? { kind: "daily", day: null }
      : { kind: "place", placeId: selected.id };
  }
  return { places, lastDest };
}

// View bar order: places marked inView, in list order.
export function visiblePlaces(places) {
  return places.filter((p) => p.inView);
}

// Toggles a place's ビューに表示 flag. Refuses to hide the last visible view
// (the bar must never be empty); returns null in that case.
export function toggleInView(places, id) {
  const target = places.find((p) => p.id === id);
  if (!target) return null;
  if (target.inView && visiblePlaces(places).length <= 1) return null;
  return places.map((p) => (p.id === id ? { ...p, inView: !p.inView } : p));
}

// Moves a place up (delta -1) or down (+1) in the settings list. Returns the
// reordered array, or the original when the move falls off either end.
export function movePlace(places, id, delta) {
  const from = places.findIndex((p) => p.id === id);
  if (from === -1) return places;
  const to = from + delta;
  if (to < 0 || to >= places.length) return places;
  const next = places.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Reorders the full list to match an array of ids (drag & drop commit).
// Ids not present in `places` are ignored; missing ids keep relative order.
export function reorderPlaces(places, orderedIds) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const next = [];
  for (const id of orderedIds) {
    const p = byId.get(id);
    if (p) {
      next.push(p);
      byId.delete(id);
    }
  }
  for (const p of places) {
    if (byId.has(p.id)) next.push(p);
  }
  return next;
}

// ---- Search view (Issue #9) ----

// The search view is a built-in place (kind 'search'). Stored place lists
// that predate it get it appended here; fresh installs go through the same
// path (defaultPlaces has no search entry), so this is the single source of
// the entry. Hiding it via the eye toggle sticks -- an existing place is
// left untouched.
export function ensureSearchPlace(places) {
  if (places.some((p) => p.kind === "search")) return places;
  return [...places, { id: "search", kind: "search", name: "Search", inView: true }];
}

// 検索用のテキスト正規化: インラインHTMLタグを落として実体参照を戻し、
// NFKC（全角/半角・互換文字）+小文字で表記ゆれを吸収する。クエリと
// 対象テキストの両方に同じ正規化をかける。
function normalizeSearchText(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Full-text match over name + note. Whitespace-separated terms are
// AND-combined. A blank query matches nothing (the view shows a hint, not
// the whole tree). Completed items are included; the view filters them via
// the shared completed-visibility toggle.
export function searchItems(items, query) {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!terms.length) return [];
  return items.filter((item) => {
    const haystack = normalizeSearchText(`${item.plainName ?? ""}\n${item.note ?? ""}`);
    return terms.every((term) => haystack.includes(term));
  });
}

// Root-first ancestor names for each index item, resolved by walking
// parentId through the flat index (mirrors the server's parent-path logic
// for /api/tasks; plainName is already time-markup-free). Mutates and
// returns the array so the fetch handler can attach paths in place.
export function attachSearchPaths(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    const path = [];
    let current = item;
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      path.unshift(parent.plainName);
      current = parent;
    }
    item.parentPath = path;
  }
  return items;
}

// ---- View switching ----

// The current view is a place id ('tasks', 'daily', or a registered node's
// place id). Falls back to the first visible view when the current one is
// hidden or deleted.
export function ensureVisibleView(places, view) {
  const order = visiblePlaces(places);
  if (order.some((p) => p.id === view)) return view;
  return order.length > 0 ? order[0].id : null;
}

// Moves to the neighboring view in bar order; stays put at either end.
export function stepView(places, view, dir) {
  const order = visiblePlaces(places).map((p) => p.id);
  const idx = order.indexOf(view);
  if (idx === -1) return order[0] ?? view;
  const next = Math.max(0, Math.min(order.length - 1, idx + dir));
  return order[next];
}

// Horizontal drag on the view bar: past ±threshold px commits one step.
// Returns -1 (left drag => next view), +1 (right drag => previous view),
// or 0 (below threshold).
export function resolveBarStep(dx, threshold = 44) {
  if (dx <= -threshold) return 1;
  if (dx >= threshold) return -1;
  return 0;
}

// ---- Daily view ----

const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const JP_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function weekdayIndex(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Date heading label: "8/8 Sat" (monospace in the UI).
export function dailyDateLabel(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d} ${EN_WEEKDAYS[weekdayIndex(dateStr)]}`;
}

// The date heading is a band: the date, then the weekday as its own badge,
// so the two can be styled apart (the badge inverts on today).
export function dailyDateParts(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return { date: `${m}/${d}`, weekday: EN_WEEKDAYS[weekdayIndex(dateStr)] };
}

// Title of the daily-note detail sheet: "2026/8/8（土）".
export function dailyNoteTitle(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${y}/${m}/${d}（${JP_WEEKDAYS[weekdayIndex(dateStr)]}）`;
}

// Header count: "6 件 / 3 日".
export function dailyCounts(groups) {
  const items = groups.reduce((n, g) => n + g.items.length, 0);
  return { items, days: groups.length };
}

// Time column of a memo row: local HH:mm from a unix-seconds timestamp.
export function itemTimeLabel(createdAt) {
  const d = new Date(createdAt * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---- Back-button layers ----

// Which open UI layer the back gesture should close first. Sheets stack over
// screens: share-format sheet > delete confirmation > compose's destination
// picker > detail sheet > subtree drilldown (any-node expand) > compose sheet
// > settings > node-summary drilldown. Returns null when nothing is open,
// i.e. back may leave the app.
export function topUiLayer({
  shareOpen,
  deleteOpen,
  pickerOpen,
  detailOpen,
  subtreeOpen,
  composeOpen,
  placesOpen,
  settingsOpen,
  drilldown,
}) {
  if (shareOpen) return "share";
  if (deleteOpen) return "delete";
  if (pickerOpen) return "picker";
  if (detailOpen) return "detail";
  if (subtreeOpen) return "subtree";
  if (composeOpen) return "compose";
  if (placesOpen) return "places";
  if (settingsOpen) return "settings";
  if (drilldown) return "drilldown";
  return null;
}

// ---- Per-view showCompleted state ----

// The completed-tasks toggle is independent per view/tab: state is a map
// keyed by scope ('today' | 'due' | 'nodes' | 'daily' | <place id>). A
// legacy boolean (from the short-lived shared setting) reads as all-off.

export function showCompletedFor(state, scope) {
  return !!(state && typeof state === "object" && state[scope]);
}

export function toggleShowCompleted(state, scope) {
  const base = state && typeof state === "object" ? state : {};
  return { ...base, [scope]: !base[scope] };
}

// ---- Completed-task filtering (Daily / registered-node views) ----

// Hides completed todos unless showCompleted. Memos (non-todo items) are
// always shown -- completion is a task concept.
export function filterCompletedItems(items, showCompleted) {
  if (showCompleted) return items;
  return items.filter((item) => !item.todo || !item.completed);
}

// Daily groups after the completed filter; a day whose items are all hidden
// loses its heading too (same rule as days with no notes at all).
export function visibleDailyGroups(groups, showCompleted) {
  if (showCompleted) return groups;
  return groups
    .map((g) => ({ ...g, items: filterCompletedItems(g.items, false) }))
    .filter((g) => g.items.length > 0);
}

// ---- Note / todo switching (detail sheet) ----

// Label of the detail sheet's layout button: it names the state the tap
// switches to, not the current one.
export function layoutActionLabel(todo) {
  return todo ? "メモにする" : "タスクにする";
}

// ---- Recurrence (detail sheet) ----

// Label of the 繰り返し row: なし / 毎日 / 毎週月 / 毎月15日.
export function recurLabel(rule) {
  if (!rule) return "なし";
  if (rule.freq === "daily") return "毎日";
  if (rule.freq === "weekly") return `毎週${JP_WEEKDAYS[rule.weekday]}`;
  return `毎月${rule.day}日`;
}

// Builds the rule for a 繰り返しエディタ chip. Weekly / monthly anchor to the
// task's due date when it has one (set the due date first to pick the day),
// falling back to today. "none" clears the rule.
export function recurRuleFor(option, due, todayStr = localDateString()) {
  const anchor = due ? due.date : todayStr;
  switch (option) {
    case "daily":
      return { freq: "daily" };
    case "weekly":
      return { freq: "weekly", weekday: weekdayIndex(anchor) };
    case "monthly":
      return { freq: "monthly", day: Number(anchor.split("-")[2]) };
    default:
      return null;
  }
}

// #recurring タグ（note末尾の目印）のクライアント側ミラー。サーバーがルール
// 設定/解除時に付け外しするのと同じ規則で、開いているシートのローカルな note を
// ずらさないために使う（ずれたまま直後にメモを編集・保存するとタグが消えるため）。
const RECUR_TAG_LINE_RE = /^\s*#recurring\s*$/;

export function addRecurTagText(note) {
  const text = note ?? "";
  if (text.split("\n").some((line) => RECUR_TAG_LINE_RE.test(line))) return text;
  const base = text.replace(/\s+$/, "");
  return base ? `${base}\n#recurring` : "#recurring";
}

export function removeRecurTagText(note) {
  if (!note) return "";
  return note
    .split("\n")
    .filter((line) => !RECUR_TAG_LINE_RE.test(line))
    .join("\n")
    .replace(/\s+$/, "");
}

// ---- Compose ----

// Compose destination:
//   { kind: 'daily', day: 'YYYY-MM-DD' | null }  (null = today at send time)
//   { kind: 'place', placeId }                    (registered node place)
//   { kind: 'node', nodeId, name }                (picked from the node tree)

// Splits the note-mode draft at the first blank line: text above becomes the
// node name, text below its note. Returns null for a blank draft.
export function splitNoteDraft(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return null;
  const lines = normalized.split("\n");
  let splitAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      splitAt = i;
      break;
    }
  }
  if (splitAt === -1) return { name: normalized.trim(), note: null };
  const name = lines.slice(0, splitAt).join("\n").trim();
  const note = lines.slice(splitAt + 1).join("\n").trim();
  if (!name) return note ? { name: note, note: null } : null;
  return { name, note: note || null };
}

// Default destination when compose opens: the place backing the current view.
// The Tasks view has no place of its own; it (like Daily) defaults to Daily
// today.
export function composeDestForView(view, places) {
  const place = places.find((p) => p.id === view && p.kind === "node");
  if (place) return { kind: "place", placeId: place.id };
  return { kind: "daily", day: null };
}

// Where a new node lands under its parent. Anything but an explicit "top"
// (including legacy/unset settings) means bottom.
export function normalizePosition(value) {
  return value === "top" ? "top" : "bottom";
}

// compose シート本体の挿入位置トグル（▲/▼で先頭/末尾を行き来する）
export function togglePosition(value) {
  return normalizePosition(value) === "top" ? "bottom" : "top";
}

export function positionLabel(value) {
  return normalizePosition(value) === "top" ? "▲ 先頭" : "▼ 末尾";
}

// The compose sheet reopens in the mode it was last used in. Anything but an
// explicit "note" (including legacy/unset settings) means task.
export function initialComposeMode(saved) {
  return saved === "note" ? "note" : "task";
}

// 連続追加はシートを開くたび OFF で始まる一時的なモード（永続化しない）。
// 送信成功後: ON なら入力だけ初期化して続行、OFF ならシートを閉じる。
export function afterSendAction(continuous) {
  return continuous ? "continue" : "close";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function mmdd(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${pad2(m)}/${pad2(d)}`;
}

// Phrase for a Daily day: 今日（08/08）/ 明日（08/09）/ 来週（08/10）/ 08/15.
export function dayPhrase(day, todayStr = localDateString()) {
  const date = day || todayStr;
  if (date === todayStr) return `今日（${mmdd(date)}）`;
  if (date === addDays(todayStr, 1)) return `明日（${mmdd(date)}）`;
  if (date === nextMonday(todayStr)) return `来週（${mmdd(date)}）`;
  return mmdd(date);
}

// Label on the compose 書き込み先 button / selector.
export function destLabel(dest, places, todayStr = localDateString()) {
  if (!dest || dest.kind === "daily") {
    return `Daily · ${dayPhrase(dest ? dest.day : null, todayStr)}`;
  }
  if (dest.kind === "place") {
    const place = places.find((p) => p.id === dest.placeId);
    return place ? place.name : "場所を選択";
  }
  return dest.name || "ノードを選択";
}

// Resolves a compose destination to the /api/send payload target fields.
export function destSendTarget(dest, places, todayStr = localDateString()) {
  if (!dest || dest.kind === "daily") {
    // Always send an explicit local date: the user's "today" is
    // authoritative, not the Workflowy server's timezone.
    return { targetType: "calendar", day: dest && dest.day ? dest.day : todayStr };
  }
  if (dest.kind === "place") {
    const place = places.find((p) => p.id === dest.placeId);
    return place && place.ref ? { targetType: "node", parentId: place.ref } : null;
  }
  return dest.nodeId ? { targetType: "node", parentId: dest.nodeId } : null;
}

// ---- Web Share Target ----

// Parses the `?title=&text=&url=` query string a share_target GET request
// arrives with into a single draft string for the note-mode compose
// textarea (feeds into splitNoteDraft: first line becomes the node name).
// Returns null when none of the three fields are present.
export function parseSharePayload(search) {
  const params = new URLSearchParams(search);
  const title = params.get("title") || "";
  const text = params.get("text") || "";
  const url = params.get("url") || "";
  const lines = [title, text, url].filter(Boolean);
  return lines.length ? lines.join("\n\n") : null;
}

// Guards openAddSheet's draftNote argument: anything that isn't a non-empty
// string (e.g. a PointerEvent when the function is wired directly as an
// event listener) means "no prefill" rather than a stringified object.
export function normalizeDraftNote(value) {
  return typeof value === "string" && value ? value : null;
}
