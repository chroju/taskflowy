export interface TaskDue {
  date: string;
  time: string | null;
}

export interface TaskLike {
  id: string;
  due?: TaskDue | null;
  parentId?: string | null;
  parentPath?: string[];
  createdAt?: number;
  completed?: boolean;
  [key: string]: unknown;
}

export interface TaskGroup<T> {
  key: string;
  label: string;
  overdue: boolean;
  tasks: T[];
}

export interface NodeSummary<T> {
  key: string;
  label: string;
  total: number;
  done: number;
  hasOverdue: boolean;
  tasks: T[];
}

export function localDateString(date?: Date): string;
export function addDays(dateStr: string, days: number): string;
export function nextMonday(dateStr: string): string;

export function normalizeTitle(raw: string | null | undefined): string;

export function formatDueShort(due: TaskDue | null, todayStr?: string): string;
export function formatDueDetail(due: TaskDue | null, todayStr?: string): string;
export function formatHeaderDate(dateStr?: string): string;
export function formatSyncAgo(nowMs: number, syncMs: number | null): string;

export function classifyDue(due: TaskDue | null, todayStr?: string): string;
export function compareDue(a: { due?: TaskDue | null }, b: { due?: TaskDue | null }): number;
export function groupTasksForView<T extends TaskLike>(
  tasks: T[],
  view: "today" | "due",
  todayStr?: string,
  showCompleted?: boolean
): TaskGroup<T>[];

export function summarizeNodes<T extends TaskLike>(tasks: T[], todayStr?: string): NodeSummary<T>[];
export function filterFinishedNodes<T extends TaskLike>(
  nodes: NodeSummary<T>[],
  showFinished: boolean
): NodeSummary<T>[];
export function groupNodeTasks<T extends TaskLike>(tasks: T[], showCompleted?: boolean): TaskGroup<T>[];
export function donutDash(done: number, total: number): string;

export function workflowyUrl(nodeId: string): string;

export function swipeDirection(dx: number, dy: number, threshold?: number): "horizontal" | "vertical" | null;
export function resolveSwipeAction(dx: number, threshold?: number): "complete" | "delete" | null;
export function clampDx(dx: number, max?: number): number;

export function dueShortcut(option: string, todayStr?: string): { date: string } | null;
