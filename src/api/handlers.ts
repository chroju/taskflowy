import { Hono } from "hono";
import { cors } from "hono/cors";
import { setCookie, getCookie } from "hono/cookie";
import { WorkflowyClient } from "./workflowy-v1";
import { encrypt, decrypt } from "./crypto";
import { extractTasks } from "./tasks";
import { collectDailyHistory, toViewItem } from "./daily";
import { setTimeMarkup, stripTimeMarkup, replaceNameText } from "./time-markup";
import { sendPush } from "./push";
import {
  getSubscriptions,
  addOrReplaceSubscription,
  removeSubscription,
  getNotificationSettings,
  setNotificationSettings,
  setStoredApiKey,
  deleteStoredApiKey,
} from "./kv-store";
import type { Env, PushSubscriptionRecord } from "../types";

type AppEnv = { Bindings: Env };

const api = new Hono<AppEnv>();

// CORS middleware
api.use("*", async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) || [];
  return cors({ origin: allowed, credentials: true })(c, next);
});

// Extract API key from encrypted cookie
async function getApiKey(c: { env: Env; req: { raw: Request }; cookie: (name: string) => string | undefined }): Promise<string> {
  const token = getCookie(c as never, "auth");
  if (!token) throw new Error("Not authenticated. Please set your API key.");
  try {
    return await decrypt(token, c.env.ENCRYPTION_KEY);
  } catch {
    throw new Error("Invalid auth cookie. Please re-enter your API key.");
  }
}

// Auth: encrypt API key and set as HTTP-Only cookie. Also mirrors the
// encrypted key into KV so the Cron trigger (which has no browser cookie)
// can authenticate as the single app user.
api.post("/auth", async (c) => {
  const { apiKey } = await c.req.json<{ apiKey: string }>();
  if (!apiKey) return c.json({ error: "apiKey required" }, 400);

  const encrypted = await encrypt(apiKey, c.env.ENCRYPTION_KEY);
  setCookie(c, "auth", encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  await setStoredApiKey(c.env.KV, encrypted);
  return c.json({ ok: true });
});

// Auth check
api.get("/auth/check", async (c) => {
  try {
    await getApiKey(c as never);
    return c.json({ authenticated: true });
  } catch {
    return c.json({ authenticated: false });
  }
});

// Logout: clear cookie and remove the KV mirror used by the Cron trigger.
api.post("/auth/logout", async (c) => {
  setCookie(c, "auth", "", {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 0,
  });
  await deleteStoredApiKey(c.env.KV);
  return c.json({ ok: true });
});

// Node listing: used by the destination picker (node tree) in the settings modal.
api.get("/nodes", async (c) => {
  const apiKey = await getApiKey(c as never);
  const parentId = c.req.query("parent_id") || "None";
  const client = new WorkflowyClient(apiKey);
  const nodes = await client.getNodes(parentId);
  return c.json(nodes);
});

// Calendar targets accept a day key; Workflowy resolves them server-side and
// creates day nodes on demand, so no date handling is needed here.
const CALENDAR_DAY_RE = /^(today|tomorrow|next_week|\d{4}-\d{2}-\d{2})$/;

// Create a node. Used for adding a new todo item or note to a destination.
api.post("/send", async (c) => {
  const apiKey = await getApiKey(c as never);
  const body = await c.req.json<{
    targetType: "node" | "calendar";
    parentId?: string;
    day?: string; // calendar only: "today" (default) | "tomorrow" | "next_week" | "YYYY-MM-DD"
    name: string;
    note?: string;
    position?: "top" | "bottom";
    layoutMode?: "todo";
  }>();

  let parentId: string;
  if (body.targetType === "calendar") {
    if (body.day !== undefined && !CALENDAR_DAY_RE.test(body.day)) {
      return c.json({ error: "invalid day key" }, 400);
    }
    parentId = body.day || "today";
  } else if (body.targetType === "node") {
    if (!body.parentId) return c.json({ error: "parentId required" }, 400);
    parentId = body.parentId;
  } else {
    return c.json({ error: "invalid targetType" }, 400);
  }

  if (body.position !== undefined && body.position !== "top" && body.position !== "bottom") {
    return c.json({ error: "invalid position" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  const result =
    body.layoutMode || body.position
      ? await client.createNode(parentId, body.name, body.note, body.position, body.layoutMode)
      : await client.createNode(parentId, body.name, body.note);
  return c.json(result);
});

// Daily view: recent day groups of the native calendar, scanning backward
// from local_date (initial load) or before_date (pagination).
api.get("/daily", async (c) => {
  const apiKey = await getApiKey(c as never);
  const beforeDate = c.req.query("before_date");
  const localDate = c.req.query("local_date");
  const anchor = beforeDate || localDate;
  if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    return c.json({ error: "local_date or before_date (YYYY-MM-DD) required" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  const groups = await collectDailyHistory(client, { localDate, beforeDate });
  return c.json(groups);
});

// Registered-node view: the node's children (one level, Workflowy order),
// tasks and notes mixed, completed included.
api.get("/nodes/:id/children", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const client = new WorkflowyClient(apiKey);
  try {
    const nodes = await client.getNodes(nodeId);
    return c.json({ items: nodes.map(toViewItem) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A registered node may have been deleted in Workflowy since.
    if (/\b404\b/.test(message)) return c.json({ error: message }, 404);
    throw err;
  }
});

// Complete node
api.post("/nodes/:id/complete", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const client = new WorkflowyClient(apiKey);
  await client.completeNode(nodeId);
  return c.json({ ok: true });
});

// Uncomplete node
api.post("/nodes/:id/uncomplete", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const client = new WorkflowyClient(apiKey);
  await client.uncompleteNode(nodeId);
  return c.json({ ok: true });
});

// Tasks: nodes with layoutMode "todo" that are not completed, flattened
// across the whole tree via nodes-export.
api.get("/tasks", async (c) => {
  const apiKey = await getApiKey(c as never);
  const client = new WorkflowyClient(apiKey);

  let nodes;
  try {
    nodes = await client.nodesExport();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Workflowy rate-limits nodes-export; surface 429 distinctly so the
    // client can fall back to its cached task list.
    if (/\b429\b/.test(message)) {
      return c.json({ error: message }, 429);
    }
    return c.json({ error: message }, 500);
  }

  // Completed todos are included so the client can show per-node progress
  // (done/total) and the completed group in the single-node view.
  const tasks = extractTasks(nodes, { includeCompleted: true });
  return c.json({ tasks });
});

// Delete a task node (left-swipe delete in the UI).
api.delete("/nodes/:id", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const client = new WorkflowyClient(apiKey);
  await client.deleteNode(nodeId);
  return c.json({ ok: true });
});

// Schedule a task: sets/replaces the <time> markup embedded in its name.
// date: null clears the due date (removes the markup).
api.post("/nodes/:id/schedule", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const body = await c.req.json<{ date: string | null; time?: string }>();

  // Only an explicit null clears; a missing date stays a 400.
  const clearing = body.date === null;
  if (!clearing && !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) {
    return c.json({ error: "date (YYYY-MM-DD) required" }, 400);
  }
  if (body.time && !/^\d{2}:\d{2}$/.test(body.time)) {
    return c.json({ error: "time must be in HH:mm format" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  const node = await client.getNode(nodeId);
  if (!node) return c.json({ error: "node not found" }, 404);

  const name = clearing
    ? stripTimeMarkup(node.name)
    : setTimeMarkup(node.name, body.date as string, body.time);
  await client.updateNode(nodeId, { name });
  return c.json({ ok: true });
});

// Update a task's note (メモ editing in the detail sheet).
api.post("/nodes/:id/note", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const body = await c.req.json<{ note: unknown }>();

  if (typeof body.note !== "string") {
    return c.json({ error: "note (string) required" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  await client.updateNode(nodeId, { note: body.note });
  return c.json({ ok: true });
});

// Rename a node (title editing in the detail sheet). The client sends the
// display text, so the existing <time> due-date markup is re-attached here
// instead of being wiped by the rename.
api.post("/nodes/:id/name", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const body = await c.req.json<{ name: unknown }>();

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return c.json({ error: "name (non-empty string) required" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  const node = await client.getNode(nodeId);
  if (!node) return c.json({ error: "node not found" }, 404);

  await client.updateNode(nodeId, { name: replaceNameText(node.name, body.name) });
  return c.json({ ok: true });
});

// Switch a node between note and todo (layoutMode). "bullets" is Workflowy's
// default layout, i.e. a plain note.
api.post("/nodes/:id/layout", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const body = await c.req.json<{ todo: unknown }>();

  if (typeof body.todo !== "boolean") {
    return c.json({ error: "todo (boolean) required" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  await client.updateNode(nodeId, { layoutMode: body.todo ? "todo" : "bullets" });
  return c.json({ ok: true });
});

// --- Web Push ---

// Public key for the client to pass to PushManager.subscribe().
api.get("/push/vapid-public-key", async (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

// Subscribe: store (or update, keyed by endpoint) a device's PushSubscription.
api.post("/push/subscribe", async (c) => {
  const subscription = await c.req.json<PushSubscriptionRecord>();
  if (!subscription.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
    return c.json({ error: "invalid push subscription" }, 400);
  }
  await addOrReplaceSubscription(c.env.KV, subscription);
  return c.json({ ok: true });
});

// Unsubscribe: drop a device's subscription by endpoint.
api.post("/push/unsubscribe", async (c) => {
  const { endpoint } = await c.req.json<{ endpoint: string }>();
  if (!endpoint) return c.json({ error: "endpoint required" }, 400);
  await removeSubscription(c.env.KV, endpoint);
  return c.json({ ok: true });
});

// Test: send a notification to every stored subscription. Used by the
// settings UI to verify push works end to end without waiting for Cron.
api.post("/push/test", async (c) => {
  const subs = await getSubscriptions(c.env.KV);
  if (subs.length === 0) {
    return c.json({ error: "no subscriptions registered" }, 400);
  }

  const vapid = {
    subject: c.env.VAPID_SUBJECT,
    publicKey: c.env.VAPID_PUBLIC_KEY,
    privateKey: c.env.VAPID_PRIVATE_KEY,
  };

  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        const result = await sendPush(
          sub,
          { title: "Taskflowy", body: "Test notification" },
          vapid
        );
        if (result.expired) await removeSubscription(c.env.KV, sub.endpoint);
        return { endpoint: sub.endpoint, ok: result.ok, status: result.status };
      } catch (err) {
        return {
          endpoint: sub.endpoint,
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  return c.json({ results });
});

// --- Notification settings ---

api.get("/notification-settings", async (c) => {
  const settings = await getNotificationSettings(c.env.KV);
  return c.json(settings);
});

api.put("/notification-settings", async (c) => {
  const body = await c.req.json<{ morningHour: number }>();
  if (
    typeof body.morningHour !== "number" ||
    !Number.isInteger(body.morningHour) ||
    body.morningHour < 0 ||
    body.morningHour > 23
  ) {
    return c.json({ error: "morningHour must be an integer 0-23" }, 400);
  }
  await setNotificationSettings(c.env.KV, { morningHour: body.morningHour });
  return c.json({ ok: true });
});

export default api;
