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

// Date heading label: "8/8 Sat" (monospace in the UI).
export function dailyDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = EN_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d} ${weekday}`;
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
// The Tasks view has no place of its own, so the last explicit choice (or
// Daily today) is kept.
export function composeDestForView(view, places, lastDest) {
  if (view === "daily") return { kind: "daily", day: null };
  const place = places.find((p) => p.id === view && p.kind === "node");
  if (place) return { kind: "place", placeId: place.id };
  return lastDest || { kind: "daily", day: null };
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
