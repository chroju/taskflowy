export type PlaceKind = "builtin" | "daily" | "node";

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  ref?: string;
  refPath?: string;
  inView: boolean;
}

export type ComposeDest =
  | { kind: "daily"; day: string | null }
  | { kind: "place"; placeId: string }
  | { kind: "node"; nodeId: string; name?: string };

export interface DailyGroupLike {
  date: string;
  items: unknown[];
  hasMore?: boolean;
}

export function defaultPlaces(): Place[];
export function migratePlaces(settings: Record<string, unknown>): {
  places: Place[];
  lastDest: ComposeDest | null;
};
export function visiblePlaces(places: Place[]): Place[];
export function toggleInView(places: Place[], id: string): Place[] | null;
export function movePlace(places: Place[], id: string, delta: number): Place[];
export function reorderPlaces(places: Place[], orderedIds: string[]): Place[];

export function ensureVisibleView(places: Place[], view: string | null): string | null;
export function stepView(places: Place[], view: string, dir: number): string;
export function resolveBarStep(dx: number, threshold?: number): -1 | 0 | 1;

export function dailyDateLabel(dateStr: string): string;
export function dailyDateParts(dateStr: string): { date: string; weekday: string };
export function dailyNoteTitle(dateStr: string): string;
export function dailyCounts(groups: DailyGroupLike[]): { items: number; days: number };
export function itemTimeLabel(createdAt: number): string;

export interface UiLayerFlags {
  deleteOpen: boolean;
  pickerOpen: boolean;
  detailOpen: boolean;
  composeOpen: boolean;
  settingsOpen: boolean;
  drilldown: boolean;
}

export function topUiLayer(
  flags: UiLayerFlags
): "delete" | "picker" | "detail" | "compose" | "settings" | "drilldown" | null;

export type ShowCompletedState = Record<string, boolean> | boolean | undefined | null;
export function showCompletedFor(state: ShowCompletedState, scope: string): boolean;
export function toggleShowCompleted(state: ShowCompletedState, scope: string): Record<string, boolean>;

export interface ViewItemLike {
  todo?: boolean;
  completed?: boolean;
  [key: string]: unknown;
}

export function filterCompletedItems<T extends ViewItemLike>(items: T[], showCompleted: boolean): T[];
export function visibleDailyGroups<G extends DailyGroupLike>(groups: G[], showCompleted: boolean): G[];

export function layoutActionLabel(todo: boolean): string;

export function splitNoteDraft(text: string | null | undefined): { name: string; note: string | null } | null;
export function composeDestForView(view: string, places: Place[]): ComposeDest;
export function normalizePosition(value: unknown): "top" | "bottom";
export function togglePosition(value: unknown): "top" | "bottom";
export function positionLabel(value: unknown): string;
export function initialComposeMode(saved: unknown): "task" | "note";
export function afterSendAction(continuous: unknown): "continue" | "close";
export function dayPhrase(day: string | null, todayStr?: string): string;
export function destLabel(dest: ComposeDest | null, places: Place[], todayStr?: string): string;
export function destSendTarget(
  dest: ComposeDest | null,
  places: Place[],
  todayStr?: string
): { targetType: "calendar"; day: string } | { targetType: "node"; parentId: string } | null;
