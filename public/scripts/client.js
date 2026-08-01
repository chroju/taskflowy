import { stripHtml } from "./utils.js";
import {
  localDateString,
  normalizeTitle,
  formatDueShort,
  formatDueDetail,
  formatHeaderDate,
  formatSyncAgo,
  classifyDue,
  groupTasksForView,
  summarizeNodes,
  groupNodeTasks,
  donutDash,
  workflowyUrl,
  swipeDirection,
  resolveSwipeAction,
  clampDx,
  dueShortcut,
} from "./tasks.js";
import { urlBase64ToUint8Array } from "./push.js";

// ==================== State ====================

let settings = loadSettings();
let isAuthenticated = false;
let tab = "today"; // 'today' | 'due' | 'nodes'
let selectedNodeKey = null; // Nodes drilldown; cleared on tab switch
let tasksState = []; // includes completed todos (for node progress)
let lastSyncMs = null;
let sheetTask = null; // task shown in the detail sheet
let addDue = "today"; // selected chip in the add sheet

const REMINDER_HOURS = [7, 8, 9, 10, 21];
const TAB_TITLES = { today: "Today", due: "Deadlines", nodes: "Nodes" };

// ==================== DOM ====================

const $ = (id) => document.getElementById(id);

const toast = $("toast");
const headerDate = $("header-date");
const settingsDate = $("settings-date");
const btnBack = $("btn-back");
const screenTitle = $("screen-title");
const screenCount = $("screen-count");
const btnSettings = $("btn-settings");
const tabbar = $("tabbar");
const taskList = $("task-list");
const btnAddTask = $("btn-add-task");

const sheetTaskEl = $("sheet-task");
const sheetTaskTitle = $("sheet-task-title");
const sheetTaskDue = $("sheet-task-due");
const sheetTaskNode = $("sheet-task-node");
const sheetTaskNote = $("sheet-task-note");
const sheetTaskLink = $("sheet-task-link");
const btnSnoozeTomorrow = $("btn-snooze-tomorrow");
const btnSnoozeWeek = $("btn-snooze-week");
const btnSheetComplete = $("btn-sheet-complete");

const sheetAddEl = $("sheet-add");
const taskNameInput = $("task-name-input");
const btnSaveTask = $("btn-save-task");

const screenSettings = $("screen-settings");
const btnCloseSettings = $("btn-close-settings");
const apikeyView = $("apikey-view");
const apikeyEdit = $("apikey-edit");
const apiKeyInput = $("api-key-input");
const btnEditApikey = $("btn-edit-apikey");
const btnSaveApikey = $("btn-save-apikey");
const btnClearApikey = $("btn-clear-apikey");
const btnToggleNotifications = $("btn-toggle-notifications");
const notificationStatus = $("notification-status");
const reminderHoursEl = $("reminder-hours");
const btnTestNotification = $("btn-test-notification");
const syncLabel = $("sync-label");
const btnSyncNow = $("btn-sync-now");
const destinationList = $("destination-list");
const btnAddDestination = $("btn-add-destination");
const panelAddDest = $("panel-add-destination");
const nodeTree = $("node-tree");
const destNameInput = $("dest-name-input");
const destTypeRadios = document.querySelectorAll('input[name="dest-type"]');
const btnSaveDestination = $("btn-save-destination");
const btnCancelDestination = $("btn-cancel-destination");

let selectedTreeNodeId = null;
let nodeTreePath = []; // [{ id, name }] breadcrumb trail
let pushSubscribed = false;
let reminderHour = null;

// ==================== Init ====================

async function init() {
  const today = formatHeaderDate();
  headerDate.textContent = today;
  settingsDate.textContent = today;
  bindEvents();
  bindSettingsEvents();
  setupMobileViewport();
  registerServiceWorker();
  await checkAuth();
  if (!isAuthenticated) {
    openSettings();
  }
  render();
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

// ==================== Settings persistence ====================

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

// ==================== Auth / API ====================

async function checkAuth() {
  try {
    const res = await fetch("/api/auth/check");
    const data = await res.json();
    isAuthenticated = data.authenticated;
  } catch {
    isAuthenticated = false;
  }
}

async function apiRequest(path, options = {}) {
  if (!isAuthenticated) {
    throw new Error("API キーが未設定です。設定から登録してください。");
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

// ==================== Task cache ====================

const TASKS_CACHE_KEY = "taskflowy_tasks_cache";
const TASKS_CACHE_TTL_MS = 60 * 1000;

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
    localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify({ tasks, timestamp: lastSyncMs || Date.now() }));
  } catch {}
}

// Load tasks: show cache immediately (stale-while-revalidate), skip the
// network round trip entirely if the cache is fresh (<60s old).
// force=true (今すぐ同期) bypasses the freshness check; the server still
// returns 429 if Workflowy's 1 req/min export limit is hit.
let tasksLoading = false;
async function loadTasks(force = false) {
  if (tasksLoading || !isAuthenticated) return;
  const cache = getTasksCache();
  if (cache) {
    tasksState = cache.tasks;
    lastSyncMs = cache.timestamp;
    render();
    const age = Date.now() - cache.timestamp;
    if (!force && age < TASKS_CACHE_TTL_MS) return;
  } else {
    taskList.innerHTML = '<div class="list-loading"><div class="spinner"></div></div>';
  }

  tasksLoading = true;
  btnSyncNow.disabled = true;
  try {
    const data = await apiRequest("/tasks");
    tasksState = data.tasks;
    lastSyncMs = Date.now();
    setTasksCache(tasksState);
    render();
  } catch (e) {
    if (!cache) {
      taskList.innerHTML = `<p class="list-empty">${escapeText(e.message)}</p>`;
    } else if (force) {
      const rateLimited = /API error 429/.test(e.message);
      showToast(rateLimited ? "同期が制限されています。1分ほど待って再試行してください。" : e.message, true);
    }
    // Background refresh errors: keep showing cached/stale view silently
  } finally {
    tasksLoading = false;
    btnSyncNow.disabled = false;
    renderSyncLabel();
  }
}

function escapeText(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==================== Rendering ====================

function selectedNode() {
  if (!selectedNodeKey) return null;
  return summarizeNodes(tasksState).find((n) => n.key === selectedNodeKey) || null;
}

function render() {
  const node = tab === "nodes" ? selectedNode() : null;
  btnBack.classList.toggle("hidden", !node);
  screenTitle.textContent = node ? node.label : TAB_TITLES[tab];

  tabbar.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  renderList(node);
}

function renderList(node) {
  taskList.innerHTML = "";

  if (!isAuthenticated) {
    screenCount.textContent = "";
    taskList.innerHTML = '<p class="list-empty">API キーを設定するとタスクが表示されます。</p>';
    return;
  }

  if (tab === "nodes" && !node) {
    renderNodeList();
    return;
  }

  const today = localDateString();
  const groups = node ? groupNodeTasks(node.tasks) : groupTasksForView(tasksState, tab, today);
  const openCount = groups.reduce((n, g) => n + g.tasks.filter((t) => !t.completed).length, 0);
  screenCount.textContent = `${openCount} 件`;

  if (!groups.length) {
    taskList.innerHTML = '<p class="list-empty">タスクはありません</p>';
    return;
  }

  for (const group of groups) {
    const header = document.createElement("div");
    header.className = "group-header" + (group.overdue ? " overdue" : "");
    header.innerHTML = `<span class="group-label"></span><span class="group-count"></span>`;
    header.querySelector(".group-label").textContent = group.label;
    header.querySelector(".group-count").textContent = String(group.tasks.length);
    taskList.appendChild(header);

    for (const task of group.tasks) {
      taskList.appendChild(buildTaskRow(task, { showParent: !node }));
    }
  }
}

function renderNodeList() {
  const nodes = summarizeNodes(tasksState);
  screenCount.textContent = `${nodes.length} ノード`;

  if (!nodes.length) {
    taskList.innerHTML = '<p class="list-empty">タスクはありません</p>';
    return;
  }

  const container = document.createElement("div");
  container.className = "node-list";

  for (const node of nodes) {
    const row = document.createElement("button");
    row.className = "node-row";
    const ring = node.hasOverdue ? "#ee99a0" : "#8aadf4";
    const track = node.hasOverdue ? "rgba(238,153,160,.28)" : "rgba(202,211,245,.16)";
    row.innerHTML = `
      <svg class="node-donut" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="none" stroke="${track}" stroke-width="3"></circle>
        <circle cx="10" cy="10" r="8" fill="none" stroke="${ring}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${donutDash(node.done, node.total)}"></circle>
      </svg>
      <span class="node-name"></span>
      <span class="node-fraction"></span>
      <span class="node-chevron">›</span>
    `;
    row.querySelector(".node-name").textContent = node.label;
    row.querySelector(".node-fraction").textContent = `${node.done}/${node.total}`;
    row.addEventListener("click", () => {
      selectedNodeKey = node.key;
      render();
    });
    container.appendChild(row);
  }

  taskList.appendChild(container);
}

function buildTaskRow(task, { showParent }) {
  const today = localDateString();

  const wrap = document.createElement("div");
  wrap.className = "task-row-wrap";
  wrap.dataset.taskId = task.id;

  const underlay = document.createElement("div");
  underlay.className = "task-row-underlay";
  underlay.innerHTML = '<span class="underlay-complete">✓ 完了</span><span class="underlay-delete">削除</span>';
  wrap.appendChild(underlay);

  const row = document.createElement("div");
  row.className = "task-row";

  const check = document.createElement("button");
  check.className = "task-check";
  check.title = "完了/未完了";
  row.appendChild(check);

  const body = document.createElement("div");
  body.className = "task-row-body";

  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = normalizeTitle(task.plainName) || "（無題）";
  body.appendChild(title);

  if (showParent && task.parentPath && task.parentPath.length) {
    const parent = document.createElement("div");
    parent.className = "task-parent";
    parent.textContent = normalizeTitle(task.parentPath[task.parentPath.length - 1]);
    body.appendChild(parent);
  }
  row.appendChild(body);

  // 期限が無い行は右カラムごと出さない（タイトルが横幅いっぱいに伸びる）
  if (task.due) {
    const meta = document.createElement("div");
    meta.className = "task-meta";
    const due = document.createElement("div");
    due.className = "task-due";
    due.textContent = formatDueShort(task.due, today);
    meta.appendChild(due);
    row.appendChild(meta);
  }

  wrap.appendChild(row);
  applyRowState(row, task);

  check.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleComplete(task, row);
  });

  bindTaskRowSwipe(wrap, row, task);
  return wrap;
}

function applyRowState(row, task) {
  const overdue = !task.completed && classifyDue(task.due, localDateString()) === "overdue";
  row.classList.toggle("done", !!task.completed);
  row.classList.toggle("overdue", overdue);
  row.querySelector(".task-check").textContent = task.completed ? "✓" : "";
}

// ==================== Task actions ====================

async function toggleComplete(task, row) {
  const target = !task.completed;
  task.completed = target;
  if (row) applyRowState(row, task);
  setTasksCache(tasksState);
  try {
    await apiRequest(`/nodes/${encodeURIComponent(task.id)}/${target ? "complete" : "uncomplete"}`, {
      method: "POST",
    });
  } catch (e) {
    task.completed = !target;
    if (row) applyRowState(row, task);
    setTasksCache(tasksState);
    showToast(e.message, true);
  }
}

async function deleteTask(task, wrap, row) {
  wrap.style.maxHeight = `${wrap.offsetHeight}px`;
  wrap.classList.add("removing");
  requestAnimationFrame(() => {
    wrap.style.maxHeight = "0";
    wrap.style.opacity = "0";
  });
  try {
    await apiRequest(`/nodes/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    tasksState = tasksState.filter((t) => t.id !== task.id);
    setTasksCache(tasksState);
    setTimeout(() => wrap.remove(), 220);
    showToast("削除しました");
  } catch (e) {
    wrap.classList.remove("removing");
    wrap.style.maxHeight = "";
    wrap.style.opacity = "";
    row.style.transform = "";
    showToast(e.message, true);
  }
}

async function scheduleTask(task, dateStr) {
  await apiRequest(`/nodes/${encodeURIComponent(task.id)}/schedule`, {
    method: "POST",
    body: JSON.stringify({ date: dateStr }),
  });
  task.due = { date: dateStr, time: null };
  setTasksCache(tasksState);
  render();
}

// Touch swipe: right = complete, left = delete. Direction is locked in on
// the first move past the threshold so vertical scrolling isn't hijacked.
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
      row.classList.add("dragging");
      dx = clampDx(curDx);
      row.style.transform = `translateX(${dx}px)`;
    },
    { passive: false }
  );

  row.addEventListener("touchend", () => {
    row.classList.remove("dragging");
    if (dragging) {
      const action = resolveSwipeAction(dx);
      if (action === "complete") {
        snapBack(row);
        if (!task.completed) toggleComplete(task, row);
        return;
      }
      if (action === "delete") {
        deleteTask(task, wrap, row);
        return;
      }
    }
    snapBack(row);
    direction = null;
    dragging = false;
  });

  row.addEventListener("touchcancel", () => {
    row.classList.remove("dragging");
    snapBack(row);
  });

  // Tap (no drag) opens the detail sheet
  row.addEventListener("click", () => {
    if (Math.abs(dx) > 4) {
      dx = 0;
      return;
    }
    openTaskSheet(task);
  });
}

function snapBack(row) {
  row.classList.add("snapping");
  row.style.transform = "";
  setTimeout(() => row.classList.remove("snapping"), 200);
}

// ==================== Detail sheet ====================

function openTaskSheet(task) {
  sheetTask = task;
  const today = localDateString();

  sheetTaskTitle.textContent = normalizeTitle(task.plainName) || "（無題）";
  sheetTaskDue.textContent = formatDueDetail(task.due, today);
  sheetTaskDue.classList.toggle("overdue", !task.completed && classifyDue(task.due, today) === "overdue");
  sheetTaskDue.classList.toggle("none", !task.due);
  sheetTaskNode.textContent = task.parentPath && task.parentPath.length
    ? normalizeTitle(task.parentPath[task.parentPath.length - 1])
    : "—";
  sheetTaskNote.textContent = task.note ? stripHtml(task.note) : "—";
  sheetTaskLink.href = workflowyUrl(task.id);
  btnSheetComplete.textContent = task.completed ? "未完了に戻す" : "完了";

  sheetTaskEl.classList.remove("hidden");
}

function closeSheets() {
  sheetTaskEl.classList.add("hidden");
  sheetAddEl.classList.add("hidden");
  sheetTask = null;
}

// ==================== Add sheet ====================

function openAddSheet() {
  taskNameInput.value = "";
  addDue = "today";
  renderDueChips();
  sheetAddEl.classList.remove("hidden");
  taskNameInput.focus();
}

function renderDueChips() {
  sheetAddEl.querySelectorAll(".due-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.due === addDue);
  });
}

async function handleAddTask() {
  const name = taskNameInput.value.trim();
  if (!name) {
    closeSheets();
    return;
  }
  const dest = settings.destinations.find((d) => d.id === settings.selectedDestinationId);
  if (!dest) {
    showToast("保存先が未設定です。設定から追加してください。", true);
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

    const due = dueShortcut(addDue);
    if (due && result.item_id) {
      await apiRequest(`/nodes/${encodeURIComponent(result.item_id)}/schedule`, {
        method: "POST",
        body: JSON.stringify({ date: due.date }),
      });
    }

    const newTask = {
      id: result.item_id || `temp-${Date.now()}`,
      name,
      plainName: name,
      note: null,
      parentId: dest.type === "node" ? dest.nodeId : null,
      parentPath: dest.type === "node" ? [dest.name] : [],
      createdAt: Math.floor(Date.now() / 1000),
      due: due ? { date: due.date, time: null } : null,
      completed: false,
    };
    tasksState = [newTask, ...tasksState];
    setTasksCache(tasksState);
    render();
    closeSheets();
    showToast("追加しました");
  } catch (e) {
    showToast(e.message, true);
  } finally {
    btnSaveTask.disabled = false;
  }
}

// ==================== Event binding ====================

function bindEvents() {
  tabbar.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      selectedNodeKey = null;
      render();
    });
  });

  btnBack.addEventListener("click", () => {
    selectedNodeKey = null;
    render();
  });

  btnSettings.addEventListener("click", openSettings);
  btnCloseSettings.addEventListener("click", closeSettings);

  btnAddTask.addEventListener("click", openAddSheet);

  document.querySelectorAll("[data-close-sheet]").forEach((el) => {
    el.addEventListener("click", closeSheets);
  });

  sheetAddEl.querySelectorAll(".due-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      addDue = chip.dataset.due;
      renderDueChips();
    });
  });

  btnSaveTask.addEventListener("click", handleAddTask);
  taskNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTask();
    }
  });

  btnSnoozeTomorrow.addEventListener("click", () => snoozeSheetTask("tomorrow"));
  btnSnoozeWeek.addEventListener("click", () => snoozeSheetTask("week"));

  btnSheetComplete.addEventListener("click", () => {
    if (!sheetTask) return;
    toggleComplete(sheetTask, findRow(sheetTask.id));
    closeSheets();
  });

  // Re-fetch when the app returns to the foreground, so edits made in
  // Workflowy itself show up (60s cache still applies).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadTasks();
  });
}

function findRow(taskId) {
  const wrap = taskList.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
  return wrap ? wrap.querySelector(".task-row") : null;
}

async function snoozeSheetTask(option) {
  if (!sheetTask) return;
  const due = dueShortcut(option);
  if (!due) return;
  const task = sheetTask;
  closeSheets();
  try {
    await scheduleTask(task, due.date);
    showToast(option === "tomorrow" ? "明日に設定しました" : "来週に設定しました");
  } catch (e) {
    showToast(e.message, true);
  }
}

// ==================== Settings ====================

function openSettings() {
  settingsDate.textContent = formatHeaderDate();
  updateApiKeyUI();
  renderDestinationList();
  refreshNotificationUI();
  renderSyncLabel();
  screenSettings.classList.remove("hidden");
}

function closeSettings() {
  screenSettings.classList.add("hidden");
}

function updateApiKeyUI() {
  apikeyView.classList.toggle("hidden", !isAuthenticated);
  apikeyEdit.classList.toggle("hidden", isAuthenticated);
  btnClearApikey.classList.toggle("hidden", !isAuthenticated);
  if (!isAuthenticated) {
    apiKeyInput.value = "";
  }
}

function bindSettingsEvents() {
  btnEditApikey.addEventListener("click", () => {
    apikeyView.classList.add("hidden");
    apikeyEdit.classList.remove("hidden");
    apiKeyInput.value = "";
    apiKeyInput.focus();
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
      if (!res.ok) throw new Error("API キーの保存に失敗しました");
      isAuthenticated = true;
      updateApiKeyUI();
      showToast("API キーを保存しました");
      render();
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
      showToast("API キーを削除しました");
      render();
    } catch (e) {
      showToast(e.message, true);
    }
  });

  btnSyncNow.addEventListener("click", () => loadTasks(true));

  btnToggleNotifications.addEventListener("click", () => {
    if (pushSubscribed) {
      disableNotifications();
    } else {
      enableNotifications();
    }
  });
  btnTestNotification.addEventListener("click", sendTestNotification);

  btnAddDestination.addEventListener("click", () => {
    panelAddDest.classList.remove("hidden");
    selectedTreeNodeId = null;
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
}

function renderSyncLabel() {
  syncLabel.textContent = formatSyncAgo(Date.now(), lastSyncMs);
}

// ==================== Destinations ====================

// Destination naming (calendar destinations get a marker icon)
const calendarTypeIcon = `<svg class="dest-type-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="4" width="18" height="18" rx="2" />
  <line x1="16" y1="2" x2="16" y2="6" />
  <line x1="8" y1="2" x2="8" y2="6" />
  <line x1="3" y1="10" x2="21" y2="10" />
</svg>`;

function destinationNameHtml(dest) {
  return `${dest.type === "calendar" ? calendarTypeIcon : ""}${escapeText(dest.name)}`;
}

function renderDestinationList() {
  destinationList.innerHTML = "";
  if (!settings.destinations.length) {
    destinationList.innerHTML = '<p class="destination-empty">未設定</p>';
    return;
  }
  for (const dest of settings.destinations) {
    const isActive = dest.id === settings.selectedDestinationId;
    const div = document.createElement("div");
    div.className = "destination-item" + (isActive ? " active" : "");
    div.innerHTML = `
      <span class="destination-item-name">${destinationNameHtml(dest)}</span>
      <button class="destination-item-delete" title="削除">&times;</button>
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

function saveDestination() {
  const type = getDestType();
  if (type === "node" && !selectedTreeNodeId) {
    showToast("ノードを選択してください", true);
    return;
  }
  const name = type === "calendar" ? "Daily Note" : destNameInput.value.trim();
  if (!name) {
    showToast("表示名を入力してください", true);
    return;
  }

  const dest = {
    id: crypto.randomUUID(),
    type,
    nodeId: type === "node" ? selectedTreeNodeId : undefined,
    name,
  };
  settings.destinations.push(dest);
  settings.selectedDestinationId = dest.id;
  saveSettings();
  renderDestinationList();
  panelAddDest.classList.add("hidden");
  showToast("保存先を追加しました");
}

// ==================== Node tree (destination picker) ====================

async function loadNodeTree(parentId) {
  nodeTree.innerHTML = '<div class="tree-empty"><div class="spinner"></div></div>';
  try {
    const pid = parentId || "None";
    const nodes = await apiRequest(`/nodes?parent_id=${encodeURIComponent(pid)}`);
    renderNodeTree(nodes);
  } catch (e) {
    nodeTree.innerHTML = `<p class="tree-empty">${escapeText(e.message)}</p>`;
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
      selectedTreeNodeId = null;
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
          selectedTreeNodeId = crumb.id;
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
    msg.className = "tree-empty";
    msg.textContent = "子ノードがありません";
    nodeTree.appendChild(msg);
    return;
  }

  for (const node of nodes) {
    const text = normalizeTitle(node.name) || "(無題)";
    const div = document.createElement("div");
    const isCompleted = node.completedAt !== null;
    div.className =
      "node-tree-item" +
      (selectedTreeNodeId === node.id ? " selected" : "") +
      (isCompleted ? " completed" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "node-tree-item-name";
    nameSpan.textContent = text;
    div.appendChild(nameSpan);

    const drillBtn = document.createElement("span");
    drillBtn.className = "node-tree-drill";
    drillBtn.textContent = "▶";
    drillBtn.title = "子ノードを表示";
    div.appendChild(drillBtn);

    // Click name to select
    nameSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedTreeNodeId = node.id;
      destNameInput.value = text;
      nodeTree.querySelectorAll(".node-tree-item").forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
    });

    // Click drill button to navigate into children
    drillBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedTreeNodeId = node.id;
      destNameInput.value = text;
      nodeTreePath.push({ id: node.id, name: text });
      loadNodeTree(node.id);
    });

    nodeTree.appendChild(div);
  }
}

// ==================== Toast ====================

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = "toast" + (isError ? " error" : "");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2200);
}

// ==================== Service Worker ====================

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

// ==================== Notifications ====================

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function refreshNotificationUI() {
  if (!pushSupported()) {
    notificationStatus.textContent = "このブラウザは Push 通知に対応していません。";
    notificationStatus.classList.remove("hidden");
    btnToggleNotifications.disabled = true;
    renderReminderHours();
    return;
  }

  if (Notification.permission === "denied") {
    notificationStatus.textContent = "通知がブロックされています。ブラウザ/OS の設定から許可してください。";
    notificationStatus.classList.remove("hidden");
    btnToggleNotifications.disabled = true;
  } else {
    notificationStatus.classList.add("hidden");
    btnToggleNotifications.disabled = false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      pushSubscribed = !!existing;
    } catch {
      pushSubscribed = false;
    }
    btnToggleNotifications.textContent = pushSubscribed ? "無効にする" : "有効にする";
    btnToggleNotifications.classList.toggle("on", pushSubscribed);
    btnTestNotification.classList.toggle("hidden", !pushSubscribed);
  }

  try {
    const data = await apiRequest("/notification-settings");
    reminderHour = data.morningHour;
  } catch {
    // Leave unset if settings can't be fetched (e.g. not authenticated yet)
  }
  renderReminderHours();
}

function renderReminderHours() {
  reminderHoursEl.innerHTML = "";
  const hours = REMINDER_HOURS.slice();
  if (reminderHour != null && !hours.includes(reminderHour)) {
    hours.push(reminderHour);
    hours.sort((a, b) => a - b);
  }
  for (const hour of hours) {
    const chip = document.createElement("button");
    chip.className = "chip mono" + (hour === reminderHour ? " active" : "");
    chip.textContent = `${hour}:00`;
    chip.addEventListener("click", () => saveReminderHour(hour));
    reminderHoursEl.appendChild(chip);
  }
}

async function saveReminderHour(hour) {
  const previous = reminderHour;
  reminderHour = hour;
  renderReminderHours();
  try {
    await apiRequest("/notification-settings", {
      method: "PUT",
      body: JSON.stringify({ morningHour: hour }),
    });
    showToast("リマインド時刻を保存しました");
  } catch (e) {
    reminderHour = previous;
    renderReminderHours();
    showToast(e.message || "リマインド時刻の保存に失敗しました", true);
  }
}

async function enableNotifications() {
  if (!pushSupported()) return;
  btnToggleNotifications.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("通知が許可されませんでした", true);
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

    showToast("通知を有効にしました");
  } catch (e) {
    showToast(e.message || "通知を有効にできませんでした", true);
  } finally {
    btnToggleNotifications.disabled = false;
    refreshNotificationUI();
  }
}

async function disableNotifications() {
  btnToggleNotifications.disabled = true;
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
    showToast("通知を無効にしました");
  } catch (e) {
    showToast(e.message || "通知を無効にできませんでした", true);
  } finally {
    btnToggleNotifications.disabled = false;
    refreshNotificationUI();
  }
}

async function sendTestNotification() {
  btnTestNotification.disabled = true;
  try {
    await apiRequest("/push/test", { method: "POST" });
    showToast("テスト通知を送信しました");
  } catch (e) {
    showToast(e.message || "テスト通知の送信に失敗しました", true);
  } finally {
    btnTestNotification.disabled = false;
  }
}

// Start
init();
