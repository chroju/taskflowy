import { Hono } from "hono";
import { cors } from "hono/cors";
import { setCookie, getCookie } from "hono/cookie";
import { WorkflowyClient } from "./workflowy-v1";
import { encrypt, decrypt } from "./crypto";
import { extractTasks } from "./tasks";
import { setTimeMarkup } from "./time-markup";
import type { Env } from "../types";

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

// Auth: encrypt API key and set as HTTP-Only cookie
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

// Logout: clear cookie
api.post("/auth/logout", async (c) => {
  setCookie(c, "auth", "", {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 0,
  });
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

// Create a node. Used for adding a new todo item to a destination.
// Workflowy creates the calendar day node on demand; "today" resolves
// server-side, so no date handling is needed here.
api.post("/send", async (c) => {
  const apiKey = await getApiKey(c as never);
  const body = await c.req.json<{
    targetType: "node" | "calendar";
    parentId?: string;
    name: string;
    note?: string;
    layoutMode?: "todo";
  }>();

  let parentId: string;
  if (body.targetType === "calendar") {
    parentId = "today";
  } else if (body.targetType === "node") {
    if (!body.parentId) return c.json({ error: "parentId required" }, 400);
    parentId = body.parentId;
  } else {
    return c.json({ error: "invalid targetType" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  const result = body.layoutMode
    ? await client.createNode(parentId, body.name, body.note, undefined, body.layoutMode)
    : await client.createNode(parentId, body.name, body.note);
  return c.json(result);
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

  const tasks = extractTasks(nodes);
  return c.json({ tasks });
});

// Schedule a task: sets/replaces the <time> markup embedded in its name.
api.post("/nodes/:id/schedule", async (c) => {
  const apiKey = await getApiKey(c as never);
  const nodeId = c.req.param("id");
  const body = await c.req.json<{ date: string; time?: string }>();

  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return c.json({ error: "date (YYYY-MM-DD) required" }, 400);
  }
  if (body.time && !/^\d{2}:\d{2}$/.test(body.time)) {
    return c.json({ error: "time must be in HH:mm format" }, 400);
  }

  const client = new WorkflowyClient(apiKey);
  const node = await client.getNode(nodeId);
  if (!node) return c.json({ error: "node not found" }, 404);

  const name = setTimeMarkup(node.name, body.date, body.time);
  await client.updateNode(nodeId, { name });
  return c.json({ ok: true });
});

export default api;
