import { describe, it, expect } from "vitest";
import {
  defaultPlaces,
  migratePlaces,
  visiblePlaces,
  toggleInView,
  movePlace,
  reorderPlaces,
  ensureVisibleView,
  stepView,
  resolveBarStep,
  dailyDateLabel,
  dailyDateParts,
  dailyNoteTitle,
  dailyCounts,
  itemTimeLabel,
  splitNoteDraft,
  topUiLayer,
  showCompletedFor,
  toggleShowCompleted,
  filterCompletedItems,
  visibleDailyGroups,
  composeDestForView,
  initialComposeMode,
  afterSendAction,
  normalizePosition,
  togglePosition,
  positionLabel,
  dayPhrase,
  destLabel,
  destSendTarget,
  layoutActionLabel,
  parseSharePayload,
} from "../../public/scripts/views.js";
import type { Place } from "../../public/scripts/views.js";

const TODAY = "2026-08-08"; // Saturday

function placesFixture(): Place[] {
  return [
    { id: "tasks", kind: "builtin", name: "Tasks", inView: true },
    { id: "daily", kind: "daily", name: "Daily", inView: true },
    { id: "p1", kind: "node", name: "記事クリップ", ref: "node-1", inView: true },
    { id: "p2", kind: "node", name: "Inbox", ref: "node-2", inView: false },
  ];
}

describe("migratePlaces", () => {
  it("builds builtins only from empty legacy settings", () => {
    const { places, lastDest } = migratePlaces({ destinations: [], selectedDestinationId: "" });
    expect(places.map((p: { id: string }) => p.id)).toEqual(["tasks", "daily"]);
    expect(lastDest).toBeNull();
  });

  it("converts legacy node destinations into registered places", () => {
    const { places } = migratePlaces({
      destinations: [
        { id: "d1", type: "node", nodeId: "n1", name: "Work" },
        { id: "d2", type: "calendar", name: "Daily Note" },
      ],
      selectedDestinationId: "",
    });
    expect(places).toHaveLength(3); // calendar destination is dropped (Daily builtin)
    expect(places[2]).toMatchObject({ id: "d1", kind: "node", ref: "n1", inView: true });
  });

  it("preserves the selected destination as the compose default", () => {
    const node = migratePlaces({
      destinations: [{ id: "d1", type: "node", nodeId: "n1", name: "Work" }],
      selectedDestinationId: "d1",
    });
    expect(node.lastDest).toEqual({ kind: "place", placeId: "d1" });

    const calendar = migratePlaces({
      destinations: [{ id: "d2", type: "calendar", name: "Daily Note" }],
      selectedDestinationId: "d2",
    });
    expect(calendar.lastDest).toEqual({ kind: "daily", day: null });
  });

  it("returns stored places untouched when already migrated", () => {
    const stored = placesFixture();
    const { places } = migratePlaces({ places: stored, lastDest: null });
    expect(places).toBe(stored);
  });
});

describe("toggleInView", () => {
  it("toggles a place's visibility", () => {
    const next = toggleInView(placesFixture(), "p2");
    expect(next!.find((p: { id: string }) => p.id === "p2")!.inView).toBe(true);
  });

  it("refuses to hide the last visible view", () => {
    const places = defaultPlaces().map((p: Place) => ({
      ...p,
      inView: p.id === "tasks",
    }));
    expect(toggleInView(places, "tasks")).toBeNull();
  });
});

describe("movePlace / reorderPlaces", () => {
  it("moves a place by one step and clamps at the ends", () => {
    const places = placesFixture();
    expect(movePlace(places, "daily", -1).map((p: { id: string }) => p.id)).toEqual([
      "daily",
      "tasks",
      "p1",
      "p2",
    ]);
    expect(movePlace(places, "tasks", -1)).toBe(places);
    expect(movePlace(places, "p2", 1)).toBe(places);
  });

  it("reorders to a full id list and appends ids missing from it", () => {
    const places = placesFixture();
    const next = reorderPlaces(places, ["p1", "tasks"]);
    expect(next.map((p: { id: string }) => p.id)).toEqual(["p1", "tasks", "daily", "p2"]);
  });
});

describe("view switching", () => {
  it("visiblePlaces filters by inView in list order", () => {
    expect(visiblePlaces(placesFixture()).map((p: { id: string }) => p.id)).toEqual([
      "tasks",
      "daily",
      "p1",
    ]);
  });

  it("ensureVisibleView falls back to the first visible view", () => {
    expect(ensureVisibleView(placesFixture(), "daily")).toBe("daily");
    expect(ensureVisibleView(placesFixture(), "p2")).toBe("tasks"); // hidden
    expect(ensureVisibleView(placesFixture(), "gone")).toBe("tasks");
  });

  it("stepView moves to the neighbor and stays put at the ends", () => {
    const places = placesFixture();
    expect(stepView(places, "tasks", 1)).toBe("daily");
    expect(stepView(places, "daily", -1)).toBe("tasks");
    expect(stepView(places, "tasks", -1)).toBe("tasks");
    expect(stepView(places, "p1", 1)).toBe("p1"); // p2 is hidden
  });

  it("resolveBarStep commits one step past ±44px", () => {
    expect(resolveBarStep(-44)).toBe(1); // drag left => next view
    expect(resolveBarStep(44)).toBe(-1); // drag right => previous view
    expect(resolveBarStep(43)).toBe(0);
    expect(resolveBarStep(-20)).toBe(0);
  });
});

describe("Daily view helpers", () => {
  it("formats the date heading", () => {
    expect(dailyDateLabel("2026-08-08")).toBe("8/8 Sat");
    expect(dailyDateLabel("2026-12-01")).toBe("12/1 Tue");
  });

  it("splits the date heading into a date and a weekday badge", () => {
    expect(dailyDateParts("2026-08-08")).toEqual({ date: "8/8", weekday: "Sat" });
    expect(dailyDateParts("2026-12-01")).toEqual({ date: "12/1", weekday: "Tue" });
  });

  it("titles the daily-note sheet with the Japanese weekday", () => {
    expect(dailyNoteTitle("2026-08-08")).toBe("2026/8/8（土）");
    expect(dailyNoteTitle("2026-12-01")).toBe("2026/12/1（火）");
  });

  it("counts items and days for the header", () => {
    const groups = [
      { date: "2026-08-08", items: [{}, {}], hasMore: false },
      { date: "2026-08-06", items: [{}], hasMore: false },
    ];
    expect(dailyCounts(groups)).toEqual({ items: 3, days: 2 });
  });

  it("formats the memo time column in local time", () => {
    const ts = Math.floor(new Date(2026, 7, 8, 9, 12).getTime() / 1000);
    expect(itemTimeLabel(ts)).toBe("09:12");
  });
});

describe("topUiLayer", () => {
  const none = {
    deleteOpen: false,
    shareOpen: false,
    pickerOpen: false,
    detailOpen: false,
    composeOpen: false,
    settingsOpen: false,
    subtreeOpen: false,
    drilldown: false,
  };

  it("returns null when nothing is open (back may leave the app)", () => {
    expect(topUiLayer(none)).toBeNull();
  });

  it("closes the delete confirmation before anything else", () => {
    expect(topUiLayer({ ...none, deleteOpen: true, detailOpen: true, drilldown: true })).toBe("delete");
  });

  it("closes the share-format sheet before the delete confirmation", () => {
    expect(topUiLayer({ ...none, shareOpen: true, deleteOpen: true })).toBe("share");
  });

  it("closes the share-format sheet before the detail sheet", () => {
    expect(topUiLayer({ ...none, shareOpen: true, detailOpen: true })).toBe("share");
  });

  it("closes the destination picker before the compose sheet", () => {
    expect(topUiLayer({ ...none, pickerOpen: true, composeOpen: true })).toBe("picker");
    expect(topUiLayer({ ...none, composeOpen: true })).toBe("compose");
  });

  it("closes an open sheet before leaving a subtree drilldown", () => {
    expect(topUiLayer({ ...none, detailOpen: true, subtreeOpen: true })).toBe("detail");
    expect(topUiLayer({ ...none, subtreeOpen: true })).toBe("subtree");
  });

  it("closes a subtree drilldown before the compose sheet", () => {
    expect(topUiLayer({ ...none, subtreeOpen: true, composeOpen: true })).toBe("subtree");
  });

  it("closes an open sheet before leaving a drilldown", () => {
    expect(topUiLayer({ ...none, detailOpen: true, drilldown: true })).toBe("detail");
    expect(topUiLayer({ ...none, drilldown: true })).toBe("drilldown");
  });

  it("closes a subtree drilldown before the node-summary drilldown", () => {
    expect(topUiLayer({ ...none, subtreeOpen: true, drilldown: true })).toBe("subtree");
  });

  it("closes the settings screen", () => {
    expect(topUiLayer({ ...none, settingsOpen: true })).toBe("settings");
  });
});

describe("per-view showCompleted state", () => {
  it("reads a scope's flag from the map, defaulting to false", () => {
    expect(showCompletedFor({ today: true }, "today")).toBe(true);
    expect(showCompletedFor({ today: true }, "due")).toBe(false);
    expect(showCompletedFor(undefined, "today")).toBe(false);
  });

  it("treats a legacy boolean value as empty state", () => {
    expect(showCompletedFor(true, "today")).toBe(false);
  });

  it("toggles one scope without touching the others", () => {
    const next = toggleShowCompleted({ today: true }, "due");
    expect(next).toEqual({ today: true, due: true });
    expect(toggleShowCompleted(next, "today")).toEqual({ today: false, due: true });
  });

  it("toggles from a missing or legacy state", () => {
    expect(toggleShowCompleted(undefined, "daily")).toEqual({ daily: true });
    expect(toggleShowCompleted(true, "daily")).toEqual({ daily: true });
  });
});

describe("completed-task filtering", () => {
  const items = [
    { id: "m1", todo: false, completed: false },
    { id: "t1", todo: true, completed: false },
    { id: "t2", todo: true, completed: true },
  ];

  it("hides completed todos but always keeps memos", () => {
    expect(filterCompletedItems(items, false).map((i: { id: string }) => i.id)).toEqual(["m1", "t1"]);
  });

  it("keeps everything when showCompleted is on", () => {
    expect(filterCompletedItems(items, true)).toBe(items);
  });

  it("drops day groups whose items are all hidden", () => {
    const groups = [
      { date: "2026-08-08", items: [{ id: "t1", todo: true, completed: false }], hasMore: false },
      { date: "2026-08-07", items: [{ id: "t2", todo: true, completed: true }], hasMore: false },
    ];
    const visible = visibleDailyGroups(groups, false);
    expect(visible.map((g: { date: string }) => g.date)).toEqual(["2026-08-08"]);
    expect(visibleDailyGroups(groups, true)).toBe(groups);
  });
});

describe("splitNoteDraft", () => {
  it("splits name and note at the first blank line", () => {
    expect(splitNoteDraft("Title line\n\nbody line 1\nbody line 2")).toEqual({
      name: "Title line",
      note: "body line 1\nbody line 2",
    });
  });

  it("keeps everything as the name when there is no blank line", () => {
    expect(splitNoteDraft("just a note")).toEqual({ name: "just a note", note: null });
  });

  it("returns null for a blank draft", () => {
    expect(splitNoteDraft("")).toBeNull();
    expect(splitNoteDraft("  \n \n")).toBeNull();
  });

  it("handles a draft that starts with a blank line", () => {
    expect(splitNoteDraft("\nbody")).toEqual({ name: "body", note: null });
  });
});

describe("compose destination", () => {
  it("defaults to the place backing the current view", () => {
    const places = placesFixture();
    expect(composeDestForView("daily", places)).toEqual({ kind: "daily", day: null });
    expect(composeDestForView("p1", places)).toEqual({ kind: "place", placeId: "p1" });
  });

  it("defaults to Daily (today) on the Tasks view", () => {
    const places = placesFixture();
    expect(composeDestForView("tasks", places)).toEqual({ kind: "daily", day: null });
  });

  it("phrases Daily days with the shared due-chip vocabulary", () => {
    expect(dayPhrase(null, TODAY)).toBe("今日（08/08）");
    expect(dayPhrase("2026-08-09", TODAY)).toBe("明日（08/09）");
    expect(dayPhrase("2026-08-10", TODAY)).toBe("来週（08/10）"); // next Monday
    expect(dayPhrase("2026-08-20", TODAY)).toBe("08/20");
  });

  it("labels destinations for the compose button", () => {
    const places = placesFixture();
    expect(destLabel({ kind: "daily", day: null }, places, TODAY)).toBe("Daily · 今日（08/08）");
    expect(destLabel({ kind: "place", placeId: "p1" }, places, TODAY)).toBe("記事クリップ");
    expect(destLabel({ kind: "node", nodeId: "n9", name: "資料" }, places, TODAY)).toBe("資料");
  });

  it("restores the last used compose mode, defaulting to task", () => {
    expect(initialComposeMode("note")).toBe("note");
    expect(initialComposeMode("task")).toBe("task");
    expect(initialComposeMode(undefined)).toBe("task");
    expect(initialComposeMode("weird")).toBe("task");
  });

  it("continues after send only when 連続追加 is on (off closes the sheet)", () => {
    expect(afterSendAction(true)).toBe("continue");
    expect(afterSendAction(false)).toBe("close");
    expect(afterSendAction(undefined)).toBe("close");
  });

  it("normalizes the insert position, defaulting to bottom", () => {
    expect(normalizePosition("top")).toBe("top");
    expect(normalizePosition("bottom")).toBe("bottom");
    expect(normalizePosition(undefined)).toBe("bottom");
    expect(normalizePosition("weird")).toBe("bottom");
  });

  it("flips the insert position toggle", () => {
    expect(togglePosition("bottom")).toBe("top");
    expect(togglePosition("top")).toBe("bottom");
    expect(togglePosition(undefined)).toBe("top"); // unset = bottom → top
  });

  it("labels the insert position toggle", () => {
    expect(positionLabel("bottom")).toBe("▼ 末尾");
    expect(positionLabel("top")).toBe("▲ 先頭");
    expect(positionLabel(undefined)).toBe("▼ 末尾");
  });

  it("resolves destinations to send targets with explicit local dates", () => {
    const places = placesFixture();
    expect(destSendTarget({ kind: "daily", day: null }, places, TODAY)).toEqual({
      targetType: "calendar",
      day: TODAY,
    });
    expect(destSendTarget({ kind: "daily", day: "2026-08-15" }, places, TODAY)).toEqual({
      targetType: "calendar",
      day: "2026-08-15",
    });
    expect(destSendTarget({ kind: "place", placeId: "p1" }, places, TODAY)).toEqual({
      targetType: "node",
      parentId: "node-1",
    });
    expect(destSendTarget({ kind: "place", placeId: "gone" }, places, TODAY)).toBeNull();
    expect(destSendTarget({ kind: "node", nodeId: "n9", name: "資料" }, places, TODAY)).toEqual({
      targetType: "node",
      parentId: "n9",
    });
  });
});

describe("layoutActionLabel", () => {
  it("offers the note side for a todo", () => {
    expect(layoutActionLabel(true)).toBe("メモにする");
  });

  it("offers the todo side for a note", () => {
    expect(layoutActionLabel(false)).toBe("タスクにする");
  });
});

describe("parseSharePayload", () => {
  it("combines title and text with a blank line", () => {
    expect(parseSharePayload("?title=Article&text=Worth+reading")).toBe("Article\n\nWorth reading");
  });

  it("appends the shared url on its own line", () => {
    expect(parseSharePayload("?title=Article&url=https%3A%2F%2Fexample.com")).toBe(
      "Article\n\nhttps://example.com"
    );
  });

  it("combines title, text, and url", () => {
    expect(
      parseSharePayload("?title=Article&text=Worth+reading&url=https%3A%2F%2Fexample.com")
    ).toBe("Article\n\nWorth reading\n\nhttps://example.com");
  });

  it("falls back to whichever field is present", () => {
    expect(parseSharePayload("?text=just+text")).toBe("just text");
    expect(parseSharePayload("?url=https%3A%2F%2Fexample.com")).toBe("https://example.com");
  });

  it("returns null when none of title/text/url are present", () => {
    expect(parseSharePayload("")).toBeNull();
    expect(parseSharePayload("?unrelated=1")).toBeNull();
  });
});
