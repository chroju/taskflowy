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
  due: { date: string; time: string | null } | null;
  completed: boolean;
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
