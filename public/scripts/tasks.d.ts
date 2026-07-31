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
  [key: string]: unknown;
}

export interface TaskGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

export interface ParentTaskGroup<T> extends TaskGroup<T> {
  path: string[];
}

export function localDateString(date?: Date): string;
export function addDays(dateStr: string, days: number): string;
export function nextMonday(dateStr: string): string;
export function formatDueBadge(due: TaskDue | null): string;
export function formatCreatedAt(createdAtSec: number): string;

export const DUE_SECTIONS: string[];
export const DUE_SECTION_LABELS: Record<string, string>;
export function classifyDue(due: TaskDue | null, todayStr?: string): string;
export function compareDue(a: { due?: TaskDue | null }, b: { due?: TaskDue | null }): number;
export function groupByDue<T extends TaskLike>(tasks: T[], todayStr?: string): TaskGroup<T>[];

export function groupByParent<T extends TaskLike>(tasks: T[]): ParentTaskGroup<T>[];

export const CREATED_SECTIONS: string[];
export const CREATED_SECTION_LABELS: Record<string, string>;
export function groupByCreated<T extends TaskLike>(tasks: T[], todayStr?: string): TaskGroup<T>[];

export function workflowyUrl(nodeId: string): string;

export function swipeDirection(dx: number, dy: number, threshold?: number): "horizontal" | "vertical" | null;
export function resolveSwipeAction(dx: number, threshold?: number): "complete" | "schedule" | null;

export function scheduleShortcut(option: string, todayStr?: string): TaskDue | null;
