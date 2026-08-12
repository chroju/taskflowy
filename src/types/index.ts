export interface Destination {
  id: string;
  type: "node" | "calendar";
  nodeId?: string;
  name: string;
}

export interface Settings {
  destinations: Destination[];
  selectedDestinationId: string;
}

export interface WorkflowyNode {
  id: string;
  name: string;
  note: string | null;
  priority: number;
  data?: { layoutMode?: string };
  createdAt: number;
  modifiedAt: number;
  completedAt: number | null;
}

// Node shape returned by GET /nodes-export (flat list of the whole tree).
export interface ExportNode {
  id: string;
  name: string;
  note: string | null;
  parent_id: string | null;
  priority: number;
  completed?: boolean;
  data?: { layoutMode?: string };
  createdAt: number;
  modifiedAt: number;
  completedAt: number | null;
}

export interface ExportNodesResponse {
  nodes: ExportNode[];
}

export interface Task {
  id: string;
  name: string; // raw name, including <time> markup
  plainName: string; // display text with <time> markup stripped
  note: string | null;
  parentId: string | null;
  parentPath: string[]; // root-first, nearest parent last
  createdAt: number;
  completedAt: number | null; // Unix seconds; used to date the 完了 groups
  due: { date: string; time: string | null } | null;
  completed: boolean;
  // Set on virtual completed instances of a recurring task (built from a
  // RecurCompletion; the Workflowy node itself stays uncompleted). recurDate
  // identifies the source record for un-completing.
  virtual?: boolean;
  recurDate?: string;
}

// One completion of a recurring task (KV: recur:completions). The Workflowy
// node is never completed; this record is what the 完了 views show. prevDue
// is kept so un-completing can restore the due date it rolled forward from.
export interface RecurCompletion {
  nodeId: string;
  date: string; // local YYYY-MM-DD the completion happened on
  prevDue: { date: string; time: string | null } | null;
  completedAt: number; // Unix seconds
}

// Item shown in the Daily / registered-node views. Tasks (layoutMode "todo")
// and plain notes share this shape, distinguished by `todo`.
export interface ViewItem {
  id: string;
  name: string; // raw name, including <time> markup
  plainName: string; // display text with <time> markup stripped
  note: string | null;
  todo: boolean;
  completed: boolean;
  due: { date: string; time: string | null } | null;
  createdAt: number;
}

// Item in the search index (GET /api/search-index): every node of the tree
// in the shared view-item shape, plus parentId so the client can build
// ancestor paths from the flat list. Full-text matching runs client-side.
export interface SearchIndexItem extends ViewItem {
  parentId: string | null;
}

// One day of daily notes in the Daily view. hasMore is set on the last group
// of a page when older days likely exist below.
export interface DailyGroup {
  date: string; // YYYY-MM-DD
  items: ViewItem[];
  hasMore: boolean;
}

export interface WorkflowyNodesResponse {
  nodes: WorkflowyNode[];
}

export interface CreateNodeResponse {
  item_id: string;
}

export interface WorkflowyNodeResponse {
  node: WorkflowyNode;
}

export interface Env {
  ENCRYPTION_KEY: string;
  ALLOWED_ORIGINS: string;
  KV: KVNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

// Web Push subscription, as returned by PushManager.subscribe() on the client.
export interface PushSubscriptionRecord {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export interface NotificationSettings {
  morningHour: number; // JST hour (0-23), default 9
}
