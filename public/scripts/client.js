import { escapeHtml, stripHtml } from "./utils.js";
import {
  localDateString,
  formatDueBadge,
  groupByDue,
  groupByParent,
  groupByCreated,
  workflowyUrl,
  swipeDirection,
  resolveSwipeAction,
  scheduleShortcut,
} from "./tasks.js";
import { urlBase64ToUint8Array } from "./push.js";

// State
let settings = loadSettings();
let isAuthenticated = false;

// DOM elements
const toast = document.getElementById("toast");
const btnSettings = document.getElementById("btn-settings");

// Settings modal
const modalSettings = document.getElementById("modal-settings");
const apiKeyInput = document.getElementById("api-key-input");
const btnSaveApikey = document.getElementById("btn-save-apikey");
const btnClearApikey = document.getElementById("btn-clear-apikey");
const btnEditApikey = document.getElementById("btn-edit-apikey");
const destinationList = document.getElementById("destination-list");
const btnAddDestination = document.getElementById("btn-add-destination");

// Add destination panel
const panelAddDest = document.getElementById("panel-add-destination");
const nodeTree = document.getElementById("node-tree");
const destNameInput = document.getElementById("dest-name-input");
const destTypeRadios = document.querySelectorAll('input[name="dest-type"]');
const btnSaveDestination = document.getElementById("btn-save-destination");
const btnCancelDestination = document.getElementById("btn-cancel-destination");

let selectedNodeId = null;

// Notifications
const notificationStatus = document.getElementById("notification-status");
const btnEnableNotifications = document.getElementById("btn-enable-notifications");
const btnDisableNotifications = document.getElementById("btn-disable-notifications");
const btnTestNotification = document.getElementById("btn-test-notification");
const notificationHourInput = document.getElementById("notification-hour-input");
const btnSaveNotificationHour = document.getElementById("btn-save-notification-hour");

// Task view
const taskList = document.getElementById("task-list");
const taskGroupTabs = document.getElementById("task-group-tabs");
const btnAddTask = document.getElementById("btn-add-task");
const modalAddTask = document.getElementById("modal-add-task");
const taskNameInput = document.getElementById("task-name-input");
const taskDestinationSelector = document.getElementById("task-destination-selector");
const taskDestinationLabel = document.getElementById("task-destination-label");
const taskDestinationDropdown = document.getElementById("task-destination-dropdown");
const btnSaveTask = document.getElementById("btn-save-task");
const modalSchedule = document.getElementById("modal-schedule");
const scheduleDateInput = document.getElementById("schedule-date-input");
const scheduleTimeInput = document.getElementById("schedule-time-input");
const btnConfirmSchedule = document.getElementById("btn-confirm-schedule");
const undoToast = document.getElementById("undo-toast");
const undoToastMessage = document.getElementById("undo-toast-message");
const btnUndo = document.getElementById("btn-undo");
const btnRefreshTasks = document.getElementById("btn-refresh-tasks");

let taskDestinationId = settings.selectedDestinationId;
let scheduleTargetTaskId = null;
let tasksState = []; // in-memory task list, kept in sync with cache
let taskGrouping = loadTaskGrouping();
let undoTimer = null;
let undoData = null; // { task } for the last completed task

// Init
async function init() {
  bindEvents();
  bindTaskEvents();
  bindNotificationEvents();
  setupMobileViewport();
  registerServiceWorker();
  await checkAuth();
  loadTasks();
}

// Handle mobile keyboard viewport
function setupMobileViewport() {
  if (window.visualViewport) {
    const app = document.getElementById("app");
    const updateViewport = () => {
      app.style.height = `${window.visualViewport.height}px`;
    };
    window.visualViewport.addEventListener("resize", updateViewport);
    updateViewport();
  }
}

function bindEvents() {
  btnSettings.addEventListener("click", () => {
    updateApiKeyUI();
    renderDestinationList();
    refreshNotificationUI();
    openModal(modalSettings);
  });

  btnSaveApikey.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      if (!res.ok) throw new Error("Failed to save API key");
      isAuthenticated = true;
      updateApiKeyUI();
      showToast("API key saved");
      loadTasks(true);
    } catch (e) {
      showToast(e.message, true);
    }
  });

  btnClearApikey.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      isAuthenticated = false;
      updateApiKeyUI();
      showToast("API key cleared");
    } catch (e) {
      showToast(e.message, true);
    }
  });

  btnEditApikey.addEventListener("click", () => {
    apiKeyInput.value = "";
    apiKeyInput.disabled = false;
    apiKeyInput.placeholder = "Enter new API key";
    btnSaveApikey.classList.remove("hidden");
    btnEditApikey.classList.add("hidden");
    btnClearApikey.classList.remove("hidden");
    apiKeyInput.focus();
  });

  btnAddDestination.addEventListener("click", () => {
    panelAddDest.classList.remove("hidden");
    selectedNodeId = null;
    nodeTreePath = [];
    destNameInput.value = "";
    setDestType("node");
    loadNodeTree();
  });

  destTypeRadios.forEach((radio) => {
    radio.addEventListener("change", () => updateDestTypeUI(getDestType()));
  });

  btnSaveDestination.addEventListener("click", saveDestination);
  btnCancelDestination.addEventListener("click", () => panelAddDest.classList.add("hidden"));

  document.querySelectorAll(".modal-backdrop").forEach((el) => {
    el.addEventListener("click", () => el.closest(".modal").classList.add("hidden"));
  });

  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => {
      document.getElementById(el.dataset.closeModal).classList.add("hidden");
    });
  });
}

// Destination naming (calendar destinations get a marker icon)
const calendarTypeIcon = `<svg class="dest-type-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="4" width="18" height="18" rx="2" />
  <line x1="16" y1="2" x2="16" y2="6" />
  <line x1="8" y1="2" x2="8" y2="6" />
  <line x1="3" y1="10" x2="21" y2="10" />
</svg>`;

function destinationNameHtml(dest) {
  return `${dest.type === "calendar" ? calendarTypeIcon : ""}${escapeHtml(dest.name)}`;
}

// Settings persistence
function loadSettings() {
  try {
    const raw = localStorage.getItem("taskflowy_settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { destinations: [], selectedDestinationId: "" };
}

function saveSettings() {
  localStorage.setItem("taskflowy_settings", JSON.stringify(settings));
}

// Auth check
async function checkAuth() {
  try {
    const res = await fetch("/api/auth/check");
    const data = await res.json();
    isAuthenticated = data.authenticated;
  } catch {
    isAuthenticated = false;
  }
}

// Update API Key UI based on auth state
function updateApiKeyUI() {
  if (isAuthenticated) {
    apiKeyInput.value = "••••••••";
    apiKeyInput.disabled = true;
    apiKeyInput.placeholder = "";
    btnSaveApikey.classList.add("hidden");
    btnClearApikey.classList.add("hidden");
    btnEditApikey.classList.remove("hidden");
  } else {
    apiKeyInput.value = "";
    apiKeyInput.disabled = false;
    apiKeyInput.placeholder = "Workflowy API Key";
    btnSaveApikey.classList.remove("hidden");
    btnClearApikey.classList.add("hidden");
    btnEditApikey.classList.add("hidden");
  }
}

// API helpers
async function apiRequest(path, options = {}) {
  if (!isAuthenticated) {
    throw new Error("Not authenticated. Open settings to set your API key.");
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Node tree for destination selection
let nodeTreePath = []; // [{ id, name }] breadcrumb trail

async function loadNodeTree(parentId) {
  nodeTree.innerHTML = '<div class="spinner"></div>';
  try {
    const pid = parentId || "None";
    const nodes = await apiRequest(`/nodes?parent_id=${encodeURIComponent(pid)}`);
    renderNodeTree(nodes);
  } catch (e) {
    nodeTree.innerHTML = `<p class="text-muted">${escapeHtml(e.message)}</p>`;
  }
}

function renderNodeTree(nodes) {
  nodeTree.innerHTML = "";

  // Breadcrumb navigation
  if (nodeTreePath.length > 0) {
    const breadcrumb = document.createElement("div");
    breadcrumb.className = "node-tree-breadcrumb";

    const rootLink = document.createElement("span");
    rootLink.className = "breadcrumb-link";
    rootLink.textContent = "Home";
    rootLink.addEventListener("click", () => {
      nodeTreePath = [];
      selectedNodeId = null;
      destNameInput.value = "";
      loadNodeTree();
    });
    breadcrumb.appendChild(rootLink);

    for (let i = 0; i < nodeTreePath.length; i++) {
      const sep = document.createElement("span");
      sep.className = "breadcrumb-sep";
      sep.textContent = " / ";
      breadcrumb.appendChild(sep);

      const crumb = nodeTreePath[i];
      if (i < nodeTreePath.length - 1) {
        const link = document.createElement("span");
        link.className = "breadcrumb-link";
        link.textContent = crumb.name;
        link.addEventListener("click", () => {
          nodeTreePath = nodeTreePath.slice(0, i + 1);
          selectedNodeId = crumb.id;
          destNameInput.value = crumb.name;
          loadNodeTree(crumb.id);
        });
        breadcrumb.appendChild(link);
      } else {
        const current = document.createElement("span");
        current.className = "breadcrumb-current";
        current.textContent = crumb.name;
        breadcrumb.appendChild(current);
      }
    }

    nodeTree.appendChild(breadcrumb);
  }

  if (!nodes.length) {
    const msg = document.createElement("p");
    msg.className = "text-muted";
    msg.textContent = "No child nodes";
    nodeTree.appendChild(msg);
    return;
  }

  for (const node of nodes) {
    const text = stripHtml(node.name || "(untitled)");
    const div = document.createElement("div");
    const isCompleted = node.completedAt !== null;
    div.className = "node-tree-item" + (selectedNodeId === node.id ? " selected" : "") + (isCompleted ? " completed" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "node-tree-item-name";
    nameSpan.textContent = text;
    div.appendChild(nameSpan);

    const drillBtn = document.createElement("span");
    drillBtn.className = "node-tree-drill";
    drillBtn.textContent = "▶";
    drillBtn.title = "Show children";
    div.appendChild(drillBtn);

    // Click name to select
    nameSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedNodeId = node.id;
      destNameInput.value = text;
      nodeTree.querySelectorAll(".node-tree-item").forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
    });

    // Click drill button to navigate into children
    drillBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedNodeId = node.id;
      destNameInput.value = text;
      nodeTreePath.push({ id: node.id, name: text });
      loadNodeTree(node.id);
    });

    nodeTree.appendChild(div);
  }
}

// Destination management
function getDestType() {
  return document.querySelector('input[name="dest-type"]:checked')?.value || "node";
}

function setDestType(type) {
  destTypeRadios.forEach((radio) => {
    radio.checked = radio.value === type;
  });
  updateDestTypeUI(type);
}

function updateDestTypeUI(type) {
  // Calendar destinations write to Workflowy's native calendar; there is no
  // node to pick and the name is fixed to "Daily Note"
  const isCalendar = type === "calendar";
  nodeTree.classList.toggle("hidden", isCalendar);
  destNameInput.closest(".input-group").classList.toggle("hidden", isCalendar);
}

function renderDestinationList() {
  destinationList.innerHTML = "";
  if (!settings.destinations.length) {
    destinationList.innerHTML = '<p class="text-muted">No destinations configured</p>';
    return;
  }
  for (const dest of settings.destinations) {
    const isActive = dest.id === settings.selectedDestinationId;
    const div = document.createElement("div");
    div.className = "destination-item" + (isActive ? " active" : "");
    div.innerHTML = `
      <span class="destination-item-name">${destinationNameHtml(dest)}</span>
      <button class="destination-item-delete" data-id="${dest.id}">&times;</button>
    `;
    div.addEventListener("click", (e) => {
      if (e.target.closest(".destination-item-delete")) return;
      settings.selectedDestinationId = dest.id;
      saveSettings();
      renderDestinationList();
    });
    div.querySelector(".destination-item-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      settings.destinations = settings.destinations.filter((d) => d.id !== dest.id);
      if (settings.selectedDestinationId === dest.id) {
        settings.selectedDestinationId = settings.destinations[0]?.id || "";
      }
      saveSettings();
      renderDestinationList();
    });
    destinationList.appendChild(div);
  }
}

function saveDestination() {
  const type = getDestType();
  if (type === "node" && !selectedNodeId) {
    showToast("Select a node first", true);
    return;
  }
  const name = type === "calendar" ? "Daily Note" : destNameInput.value.trim();
  if (!name) {
    showToast("Enter a name", true);
    return;
  }

  const dest = {
    id: crypto.randomUUID(),
    type,
    nodeId: type === "node" ? selectedNodeId : undefined,
    name,
  };
  settings.destinations.push(dest);
  settings.selectedDestinationId = dest.id;
  saveSettings();
  renderDestinationList();
  panelAddDest.classList.add("hidden");
  showToast("Destination added");
}

// ==================== Task view ====================

const TASKS_CACHE_KEY = "taskflowy_tasks_cache";
const TASKS_CACHE_TTL_MS = 60 * 1000;
const TASK_GROUPING_KEY = "taskflowy_task_grouping";

function loadTaskGrouping() {
  try {
    const val = localStorage.getItem(TASK_GROUPING_KEY);
    if (val === "due" || val === "parent" || val === "created") return val;
  } catch {}
  return "due";
}

function saveTaskGrouping(val) {
  taskGrouping = val;
  try {
    localStorage.setItem(TASK_GROUPING_KEY, val);
  } catch {}
}

function getTasksCache() {
  try {
    const raw = localStorage.getItem(TASKS_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !Array.isArray(entry.tasks)) return null;
    return entry;
  } catch {
    return null;
  }
}

function setTasksCache(tasks) {
  try {
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify({ tasks, timestamp: Date.now() }));
  } catch {}
}

function bindTaskEvents() {
  taskGroupTabs.querySelectorAll(".segmented-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      saveTaskGrouping(btn.dataset.group);
      renderTaskGroupTabs();
      renderTasks();
    });
  });
  renderTaskGroupTabs();

  btnAddTask.addEventListener("click", () => {
    taskNameInput.value = "";
    taskDestinationId = settings.selectedDestinationId;
    updateTaskDestinationLabel();
    openModal(modalAddTask, () => taskNameInput.focus());
  });

  taskDestinationSelector.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTaskDestinationDropdown();
  });
  document.addEventListener("click", () => {
    taskDestinationDropdown.classList.add("hidden");
  });

  btnSaveTask.addEventListener("click", handleAddTask);
  taskNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTask();
    }
  });

  document.querySelectorAll(".schedule-shortcut").forEach((btn) => {
    btn.addEventListener("click", () => {
      const shortcut = scheduleShortcut(btn.dataset.shortcut);
      if (!shortcut) return;
      scheduleDateInput.value = shortcut.date;
      document.querySelectorAll(".schedule-shortcut").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  scheduleDateInput.addEventListener("change", () => {
    document.querySelectorAll(".schedule-shortcut").forEach((b) => b.classList.remove("active"));
  });

  btnConfirmSchedule.addEventListener("click", handleConfirmSchedule);

  btnUndo.addEventListener("click", handleUndoComplete);

  btnRefreshTasks.addEventListener("click", () => loadTasks(true));

  // Re-fetch when the app returns to the foreground, so edits made in
  // Workflowy itself show up (60s cache still applies).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadTasks();
  });
}

function renderTaskGroupTabs() {
  taskGroupTabs.querySelectorAll(".segmented-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.group === taskGrouping);
  });
}

function toggleTaskDestinationDropdown() {
  if (!taskDestinationDropdown.classList.contains("hidden")) {
    taskDestinationDropdown.classList.add("hidden");
    return;
  }
  if (!settings.destinations.length) return;

  taskDestinationDropdown.innerHTML = "";
  for (const dest of settings.destinations) {
    const isActive = dest.id === taskDestinationId;
    const item = document.createElement("div");
    item.className = "destination-dropdown-item" + (isActive ? " active" : "");
    item.innerHTML = destinationNameHtml(dest);
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      taskDestinationId = dest.id;
      updateTaskDestinationLabel();
      taskDestinationDropdown.classList.add("hidden");
    });
    taskDestinationDropdown.appendChild(item);
  }
  taskDestinationDropdown.classList.remove("hidden");
}

function updateTaskDestinationLabel() {
  const dest = settings.destinations.find((d) => d.id === taskDestinationId) || null;
  taskDestinationLabel.innerHTML = dest ? destinationNameHtml(dest) : "No destination";
}

// Load tasks: show cache immediately (stale-while-revalidate), skip the
// network round trip entirely if the cache is fresh (<60s old).
// force=true (manual refresh) bypasses the freshness check; the server
// still returns 429 if Workflowy's 1 req/min export limit is hit.
let tasksLoading = false;
async function loadTasks(force = false) {
  if (tasksLoading) return;
  const cache = getTasksCache();
  if (cache) {
    tasksState = cache.tasks;
    renderTasks();
    const age = Date.now() - cache.timestamp;
    if (!force && age < TASKS_CACHE_TTL_MS) return;
  } else {
    taskList.innerHTML = '<div class="task-loading"><div class="spinner"></div></div>';
  }

  tasksLoading = true;
  btnRefreshTasks.classList.add("refreshing");
  try {
    const data = await apiRequest("/tasks");
    tasksState = data.tasks;
    setTasksCache(tasksState);
    renderTasks();
  } catch (e) {
    if (!cache) {
      taskList.innerHTML = `<p class="task-empty">${escapeHtml(e.message)}</p>`;
    } else if (force) {
      // Manual refresh failed (likely rate limited): say so instead of
      // silently keeping the stale view.
      const rateLimited = /API error 429/.test(e.message);
      showToast(rateLimited ? "Rate limited. Try again in a minute." : e.message, true);
    }
    // Background refresh errors: keep showing cached/stale view silently
  } finally {
    tasksLoading = false;
    btnRefreshTasks.classList.remove("refreshing");
  }
}

function renderTasks() {
  if (!tasksState.length) {
    taskList.innerHTML = '<p class="task-empty">No tasks</p>';
    return;
  }

  let groups;
  if (taskGrouping === "parent") {
    groups = groupByParent(tasksState);
  } else if (taskGrouping === "created") {
    groups = groupByCreated(tasksState);
  } else {
    groups = groupByDue(tasksState);
  }

  // The parent-node view groups rows under their own parent path, so the
  // per-row path chip would be redundant there.
  const showParentPath = taskGrouping !== "parent";

  taskList.innerHTML = "";
  for (const group of groups) {
    const header = document.createElement("div");
    header.className = "task-section-header" + (group.key === "overdue" ? " overdue" : "");
    header.textContent = taskGrouping === "parent" && group.path && group.path.length ? group.path.join(" / ") : group.label;
    taskList.appendChild(header);

    for (const task of group.tasks) {
      taskList.appendChild(buildTaskRow(task, { showParentPath }));
    }
  }
}

function buildTaskRow(task, { showParentPath }) {
  const wrap = document.createElement("div");
  wrap.className = "task-row-wrap";
  wrap.dataset.taskId = task.id;

  const completeAction = document.createElement("div");
  completeAction.className = "task-row-action complete";
  completeAction.textContent = "Complete";
  wrap.appendChild(completeAction);

  const scheduleAction = document.createElement("div");
  scheduleAction.className = "task-row-action schedule";
  scheduleAction.textContent = "Schedule";
  wrap.appendChild(scheduleAction);

  const row = document.createElement("div");
  row.className = "task-row";

  const body = document.createElement("div");
  body.className = "task-row-body";

  const nameEl = document.createElement("div");
  nameEl.className = "task-row-name";
  nameEl.textContent = task.plainName;
  body.appendChild(nameEl);

  const meta = document.createElement("div");
  meta.className = "task-row-meta";

  if (task.due) {
    const badge = document.createElement("span");
    const cls = classifyDueForBadge(task.due);
    badge.className = "task-due-badge" + (cls ? ` ${cls}` : "");
    badge.textContent = formatDueBadge(task.due);
    meta.appendChild(badge);
  }

  if (showParentPath && task.parentPath && task.parentPath.length) {
    const pathEl = document.createElement("span");
    pathEl.className = "task-parent-path";
    pathEl.textContent = task.parentPath.join(" / ");
    meta.appendChild(pathEl);
  }

  if (meta.childNodes.length) body.appendChild(meta);
  row.appendChild(body);

  const hoverActions = document.createElement("div");
  hoverActions.className = "task-row-hover-actions";
  hoverActions.innerHTML = `
    <button class="task-row-hover-btn complete" data-action="complete" title="Complete">
      <iconify-icon icon="heroicons:check-circle" width="20" height="20"></iconify-icon>
    </button>
    <button class="task-row-hover-btn schedule" data-action="schedule" title="Set due date">
      <iconify-icon icon="heroicons:calendar-days" width="20" height="20"></iconify-icon>
    </button>
  `;
  hoverActions.querySelector('[data-action="complete"]').addEventListener("click", (e) => {
    e.stopPropagation();
    completeTaskRow(wrap, task.id);
  });
  hoverActions.querySelector('[data-action="schedule"]').addEventListener("click", (e) => {
    e.stopPropagation();
    openScheduleSheet(task.id);
  });
  row.appendChild(hoverActions);

  wrap.appendChild(row);
  bindTaskRowSwipe(wrap, row, task);
  return wrap;
}

function classifyDueForBadge(due) {
  const today = localDateString();
  if (due.date < today) return "overdue";
  if (due.date === today) return "today";
  return "";
}

// Touch swipe: right = complete, left = open schedule sheet. Direction is
// locked in on the first move past the threshold so vertical scrolling
// isn't hijacked.
function bindTaskRowSwipe(wrap, row, task) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let direction = null; // "horizontal" | "vertical" | null
  let dragging = false;

  row.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      dx = 0;
      direction = null;
      dragging = false;
      row.classList.add("dragging");
    },
    { passive: true }
  );

  row.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      const curDx = t.clientX - startX;
      const curDy = t.clientY - startY;

      if (!direction) {
        direction = swipeDirection(curDx, curDy, 10);
        if (direction === "vertical") return; // let the page scroll
      }
      if (direction !== "horizontal") return;

      dragging = true;
      e.preventDefault();
      dx = curDx;
      row.style.transform = `translateX(${dx}px)`;
    },
    { passive: false }
  );

  row.addEventListener("touchend", () => {
    row.classList.remove("dragging");
    if (dragging) {
      const action = resolveSwipeAction(dx, 80);
      if (action === "complete") {
        completeTaskRow(wrap, task.id);
        return;
      } else if (action === "schedule") {
        row.style.transform = "";
        openScheduleSheet(task.id);
        return;
      }
    }
    row.style.transform = "";
    direction = null;
    dragging = false;
  });

  row.addEventListener("touchcancel", () => {
    row.classList.remove("dragging");
    row.style.transform = "";
  });

  // Tap (no drag) opens the node in Workflowy
  row.addEventListener("click", (e) => {
    if (e.target.closest(".task-row-hover-actions")) return;
    if (Math.abs(dx) > 5) {
      dx = 0;
      return;
    }
    window.open(workflowyUrl(task.id), "_blank", "noopener");
  });
}

async function completeTaskRow(wrap, taskId) {
  const task = tasksState.find((t) => t.id === taskId);
  if (!task) return;

  wrap.querySelector(".task-row")?.classList.add("completing");
  wrap.style.maxHeight = `${wrap.offsetHeight}px`;
  requestAnimationFrame(() => {
    const rowEl = wrap.querySelector(".task-row");
    if (rowEl) rowEl.style.transform = "translateX(120%)";
    wrap.style.opacity = "0";
  });

  try {
    await apiRequest(`/nodes/${encodeURIComponent(taskId)}/complete`, { method: "POST" });
  } catch (e) {
    showToast(e.message, true);
    wrap.style.opacity = "";
    wrap.querySelector(".task-row")?.classList.remove("completing");
    const rowEl = wrap.querySelector(".task-row");
    if (rowEl) rowEl.style.transform = "";
    return;
  }

  tasksState = tasksState.filter((t) => t.id !== taskId);
  setTasksCache(tasksState);
  setTimeout(() => {
    wrap.remove();
    if (!taskList.querySelector(".task-row-wrap")) renderTasks();
  }, 260);

  showUndoToast(task);
}

function showUndoToast(task) {
  undoData = { task };
  undoToastMessage.textContent = `"${task.plainName}" completed`;
  undoToast.classList.remove("hidden");
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoToast.classList.add("hidden");
    undoData = null;
  }, 5000);
}

async function handleUndoComplete() {
  if (!undoData) return;
  const { task } = undoData;
  undoToast.classList.add("hidden");
  if (undoTimer) clearTimeout(undoTimer);
  undoData = null;

  try {
    await apiRequest(`/nodes/${encodeURIComponent(task.id)}/uncomplete`, { method: "POST" });
    tasksState = [task, ...tasksState.filter((t) => t.id !== task.id)];
    setTasksCache(tasksState);
    renderTasks();
    showToast("Task restored");
  } catch (e) {
    showToast(e.message, true);
  }
}

function openScheduleSheet(taskId) {
  scheduleTargetTaskId = taskId;
  scheduleDateInput.value = "";
  scheduleTimeInput.value = "";
  document.querySelectorAll(".schedule-shortcut").forEach((b) => b.classList.remove("active"));
  openModal(modalSchedule);
}

async function handleConfirmSchedule() {
  const date = scheduleDateInput.value;
  if (!date) {
    showToast("Choose a date", true);
    return;
  }
  const time = scheduleTimeInput.value || undefined;
  const taskId = scheduleTargetTaskId;
  if (!taskId) return;

  btnConfirmSchedule.disabled = true;
  try {
    await apiRequest(`/nodes/${encodeURIComponent(taskId)}/schedule`, {
      method: "POST",
      body: JSON.stringify({ date, time }),
    });
    const task = tasksState.find((t) => t.id === taskId);
    if (task) {
      task.due = { date, time: time || null };
      setTasksCache(tasksState);
      renderTasks();
    }
    modalSchedule.classList.add("hidden");
    showToast("Scheduled");
  } catch (e) {
    showToast(e.message, true);
  } finally {
    btnConfirmSchedule.disabled = false;
  }
}

async function handleAddTask() {
  const name = taskNameInput.value.trim();
  if (!name) return;
  const dest = settings.destinations.find((d) => d.id === taskDestinationId);
  if (!dest) {
    showToast("No destination selected", true);
    return;
  }

  btnSaveTask.disabled = true;
  try {
    const result = await apiRequest("/send", {
      method: "POST",
      body: JSON.stringify({
        targetType: dest.type,
        parentId: dest.type === "node" ? dest.nodeId : undefined,
        name,
        layoutMode: "todo",
      }),
    });

    const newTask = {
      id: result.item_id || `temp-${Date.now()}`,
      name,
      plainName: name,
      note: null,
      parentId: dest.type === "node" ? dest.nodeId : null,
      parentPath: [],
      createdAt: Math.floor(Date.now() / 1000),
      due: null,
    };
    tasksState = [newTask, ...tasksState];
    setTasksCache(tasksState);
    renderTasks();

    modalAddTask.classList.add("hidden");
    showToast("Task added");
  } catch (e) {
    showToast(e.message, true);
  } finally {
    btnSaveTask.disabled = false;
  }
}

// Modal helpers
function openModal(modal, onOpen) {
  modal.classList.remove("hidden");
  if (onOpen) onOpen();
}

// Toast
function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = "toast" + (isError ? " error" : "");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2000);
}

// Service Worker
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

// ==================== Notifications ====================

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function bindNotificationEvents() {
  btnEnableNotifications.addEventListener("click", enableNotifications);
  btnDisableNotifications.addEventListener("click", disableNotifications);
  btnTestNotification.addEventListener("click", sendTestNotification);
  btnSaveNotificationHour.addEventListener("click", saveNotificationHour);
}

async function refreshNotificationUI() {
  if (!pushSupported()) {
    notificationStatus.textContent = "Push notifications are not supported in this browser.";
    btnEnableNotifications.classList.add("hidden");
    btnDisableNotifications.classList.add("hidden");
    btnTestNotification.classList.add("hidden");
    return;
  }

  if (Notification.permission === "denied") {
    notificationStatus.textContent = "Notifications are blocked. Enable them in your browser/OS settings.";
    btnEnableNotifications.classList.add("hidden");
    btnDisableNotifications.classList.add("hidden");
    btnTestNotification.classList.add("hidden");
  } else {
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscribed = !!existing;
      notificationStatus.textContent = subscribed
        ? "Notifications are enabled on this device."
        : "Notifications are not enabled on this device.";
      btnEnableNotifications.classList.toggle("hidden", subscribed);
      btnDisableNotifications.classList.toggle("hidden", !subscribed);
      btnTestNotification.classList.toggle("hidden", !subscribed);
    } catch {
      notificationStatus.textContent = "Could not determine notification status.";
    }
  }

  try {
    const settings = await apiRequest("/notification-settings");
    notificationHourInput.value = settings.morningHour;
  } catch {
    // Leave the input blank if settings can't be fetched (e.g. not authenticated yet)
  }
}

async function enableNotifications() {
  if (!pushSupported()) return;
  btnEnableNotifications.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("Notification permission was not granted", true);
      return;
    }

    const { publicKey } = await apiRequest("/push/vapid-public-key");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await apiRequest("/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription.toJSON()),
    });

    showToast("Notifications enabled");
  } catch (e) {
    showToast(e.message || "Failed to enable notifications", true);
  } finally {
    btnEnableNotifications.disabled = false;
    refreshNotificationUI();
  }
}

async function disableNotifications() {
  btnDisableNotifications.disabled = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await apiRequest("/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    showToast("Notifications disabled");
  } catch (e) {
    showToast(e.message || "Failed to disable notifications", true);
  } finally {
    btnDisableNotifications.disabled = false;
    refreshNotificationUI();
  }
}

async function sendTestNotification() {
  btnTestNotification.disabled = true;
  try {
    await apiRequest("/push/test", { method: "POST" });
    showToast("Test notification sent");
  } catch (e) {
    showToast(e.message || "Failed to send test notification", true);
  } finally {
    btnTestNotification.disabled = false;
  }
}

async function saveNotificationHour() {
  const hour = parseInt(notificationHourInput.value, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) {
    showToast("Enter an hour between 0 and 23", true);
    return;
  }
  btnSaveNotificationHour.disabled = true;
  try {
    await apiRequest("/notification-settings", {
      method: "PUT",
      body: JSON.stringify({ morningHour: hour }),
    });
    showToast("Reminder time saved");
  } catch (e) {
    showToast(e.message || "Failed to save reminder time", true);
  } finally {
    btnSaveNotificationHour.disabled = false;
  }
}

// Start
init();
