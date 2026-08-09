import { stripHtml } from "./utils.js";
import {
  localDateString,
  addDays,
  nextMonday,
  normalizeTitle,
  formatDueShort,
  formatDueDetail,
  formatHeaderDate,
  formatSyncAgo,
  classifyDue,
  groupTasksForView,
  completedTasksForDueView,
  countCompletedForView,
  summarizeNodes,
  filterFinishedNodes,
  groupNodeTasks,
  donutDash,
  workflowyUrl,
  shareText,
  swipeDirection,
  resolveSwipeAction,
  clampDx,
  dueShortcut,
} from "./tasks.js";
import {
  migratePlaces,
  visiblePlaces,
  ensureVisibleView,
  stepView,
  resolveBarStep,
  dailyDateParts,
  dailyNoteTitle,
  dailyCounts,
  itemTimeLabel,
  filterCompletedItems,
  visibleDailyGroups,
  showCompletedFor,
  toggleShowCompleted,
  composeDestForView,
  topUiLayer,
  initialComposeMode,
  afterSendAction,
  normalizePosition,
  togglePosition,
  positionLabel,
  destLabel,
  destSendTarget,
  splitNoteDraft,
  layoutActionLabel,
  toggleInView,
  editBadgeAction,
  movePlace,
  reorderPlaces,
  parseSharePayload,
} from "./views.js";
import { urlBase64ToUint8Array } from "./push.js";

// ==================== State ====================

let settings = loadSettings();
// 場所（ビュー兼書き込み先）モデルへの移行。旧destinations設定から変換する。
settings.places = migratePlaces(settings).places;
let isAuthenticated = false;
let view = "tasks"; // 'tasks' | 'daily' | <place id>; restored in init()
let tab = "today"; // Tasks ビュー内: 'today' | 'due' | 'nodes'
let selectedNodeKey = null; // Nodes drilldown; cleared on tab switch
let tasksState = []; // includes completed todos (for node progress)
// Deadlines の完了グループ: 表示済みの 7 日ウィンドウ数と、その先の有無
let dueCompletedPages = 1;
let dueDoneHasMore = false;
let lastSyncMs = null;
let sheetTask = null; // task/item shown in the detail sheet
let sheetOrigin = "tasks"; // どのビューの行か: 'tasks' | 'daily' | <place id>
let sheetIsMemo = false; // メモ用の読み物レイアウトで表示中か
let sheetDate = null; // Daily の日付ノードを開いているときの日付キー
let addDue = "today"; // selected chip in the add sheet
let pendingDelete = null; // { run } awaiting delete confirmation

// Daily ビュー
let dailyGroups = [];
let dailyHasMore = false;
let dailyLoading = false;
let dailyFetchedAt = null;

// 登録ノードビュー: placeId -> { items, timestamp }
let nodeViews = {};
const nodeViewLoading = new Set();

// サブツリードリルダウン（行タップで任意ノードの子を展開）。何階層でも
// 重ね開けるスタック。メモリ上のみで、登録済みの場所とは異なり永続化しない。
let subtreeStack = []; // { nodeId, title, items }[]
let subtreeLoading = false;

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
const viewbar = $("viewbar");
const viewbarTrack = $("viewbar-track");
const btnViewbarEdit = $("btn-viewbar-edit");

const sheetTaskEl = $("sheet-task");
const sheetItemMeta = $("sheet-item-meta");
const sheetTaskProps = $("sheet-task-props");
const sheetItemNote = $("sheet-item-note");
const btnSheetDelete = $("btn-sheet-delete");
const sheetActions = $("sheet-actions");
const sheetTaskTitle = $("sheet-task-title");
const sheetTaskDue = $("sheet-task-due");
const sheetTaskNode = $("sheet-task-node");
const sheetTaskNote = $("sheet-task-note");
const sheetTaskLink = $("sheet-task-link");
const btnSheetShare = $("btn-sheet-share");
const sheetShareEl = $("sheet-share");
const btnShareUrl = $("btn-share-url");
const btnShareText = $("btn-share-text");
const btnSnoozeTomorrow = $("btn-snooze-tomorrow");
const btnSheetComplete = $("btn-sheet-complete");
const sheetDueEditor = $("sheet-due-editor");
const sheetDateInput = $("sheet-date-input");
const sheetTimeInput = $("sheet-time-input");
const btnSheetSetDue = $("btn-sheet-set-due");
const btnSheetLayout = $("btn-sheet-layout");

const sheetAddEl = $("sheet-add");
const composeMain = $("compose-main");
const composeModebar = $("compose-modebar");
const composeDestRow = $("compose-dest-row");
const btnComposeDest = $("btn-compose-dest");
const composeDestIcon = $("compose-dest-icon");
const composeDestName = $("compose-dest-name");
const composeTaskBody = $("compose-task-body");
const composeNoteBody = $("compose-note-body");
const noteInput = $("note-input");
const btnComposeDestSmall = $("btn-compose-dest-small");
const composeDestSmallIcon = $("compose-dest-small-icon");
const composeDestSmallName = $("compose-dest-small-name");
const btnSaveNote = $("btn-save-note");
const taskNameInput = $("task-name-input");
const taskDateInput = $("task-date-input");
const taskTimeInput = $("task-time-input");
const btnSaveTask = $("btn-save-task");
const btnContinuousTask = $("btn-continuous-task");
const btnContinuousNote = $("btn-continuous-note");
const composePicker = $("compose-picker");
const btnPickerDone = $("btn-picker-done");
const pickerDailyChips = $("picker-daily-chips");
const pickerDateInput = $("picker-date-input");
const btnPosTask = $("btn-pos-task");
const btnPosNote = $("btn-pos-note");
const pickerPlaces = $("picker-places");
const pickerNodeTree = $("picker-node-tree");

const sheetDeleteEl = $("sheet-delete");
const sheetDeleteTitle = $("sheet-delete-title");
const sheetDeleteNote = $("sheet-delete-note");
const btnConfirmDelete = $("btn-confirm-delete");
const btnCancelDelete = $("btn-cancel-delete");

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
const placeList = $("place-list");
const placeCount = $("place-count");
const btnAddDestination = $("btn-add-destination");
const panelAddDest = $("panel-add-destination");
const nodeTree = $("node-tree");
const destNameInput = $("dest-name-input");
const btnSaveDestination = $("btn-save-destination");
const btnCancelDestination = $("btn-cancel-destination");

let selectedTreeNodeId = null;
let pushSubscribed = false;
let reminderHour = null;

// ==================== Init ====================

async function init() {
  const today = formatHeaderDate();
  headerDate.textContent = today;
  settingsDate.textContent = today;
  view = ensureVisibleView(settings.places, settings.lastView || "tasks") || "tasks";
  nodeViews = loadNodeViewsCache();
  bindEvents();
  bindSettingsEvents();
  bindBackButton();
  setupMobileViewport();
  registerServiceWorker();
  await checkAuth();
  if (!isAuthenticated) {
    openSettings();
  }
  render();
  loadCurrentView();
  openSharedComposeIfAny();
}

// Web Share Target からの起動（?share-target&title=&text=&url=）を検知し、
// compose シートをノート事前入力で開く。URL は履歴に残さない（リロードで再発火しないよう置き換える）。
function openSharedComposeIfAny() {
  if (!isAuthenticated) return;
  const draft = parseSharePayload(window.location.search);
  if (!draft) return;
  history.replaceState(history.state, "", window.location.pathname);
  openAddSheet(draft);
}

// Fetches the data behind the active view (stale-while-revalidate each).
function loadCurrentView(force = false) {
  if (view === "tasks") loadTasks(force);
  else if (view === "daily") loadDaily(force);
  else loadNodeView(view, force);
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

function currentPlace() {
  return settings.places.find((p) => p.id === view) || null;
}

function placeLabelForOrigin(origin) {
  if (origin === "daily") return "Daily";
  if (origin === "subtree") {
    const top = subtreeStack[subtreeStack.length - 1];
    return top ? top.title : "";
  }
  const place = settings.places.find((p) => p.id === origin);
  return place ? place.name : "";
}

function render() {
  renderViewBar();
  if (subtreeStack.length) {
    renderSubtreeView();
  } else if (view === "tasks") {
    renderTasksView();
  } else if (view === "daily") {
    renderDailyView();
  } else {
    renderNodeView();
  }
}

// 完了済みタスクの表示トグル。状態はビュー/タブごとに独立
// （scope: 'today' | 'due' | 'nodes' | 'daily' | <place id>）。
// 完了済みが 1 件も無いビューには出さない。
function buildCompletedToggle(completedCount, scope) {
  const show = showCompletedFor(settings.showCompletedTasks, scope);
  const btn = document.createElement("button");
  btn.className = "node-filter" + (show ? " active" : "");
  btn.textContent = show ? "完了済みを隠す" : `完了済みを表示 (${completedCount})`;
  btn.addEventListener("click", () => {
    settings.showCompletedTasks = toggleShowCompleted(settings.showCompletedTasks, scope);
    saveSettings();
    render();
  });
  return btn;
}

function renderTasksView() {
  tabbar.classList.remove("hidden");
  const node = tab === "nodes" ? selectedNode() : null;
  btnBack.classList.toggle("hidden", !node);
  screenTitle.textContent = node ? node.label : TAB_TITLES[tab];

  tabbar.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  renderList(node);
}

// ==================== View bar ====================

let barSuppressClick = false;
let viewbarEditing = false;

const ICON_BADGE_CLOSE = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;

function renderViewBar() {
  viewbarTrack.innerHTML = "";
  viewbar.classList.toggle("editing", viewbarEditing);
  btnViewbarEdit.textContent = viewbarEditing ? "完了" : "編集";
  btnViewbarEdit.classList.toggle("active", viewbarEditing);
  for (const place of visiblePlaces(settings.places)) {
    const pill = document.createElement("button");
    pill.className = "view-pill" + (place.id === view ? " active" : "");
    pill.dataset.view = place.id;
    pill.setAttribute("role", "tab");
    pill.setAttribute("aria-selected", place.id === view ? "true" : "false");
    pill.innerHTML = '<span class="view-dot"></span><span class="view-pill-name"></span>';
    pill.querySelector(".view-pill-name").textContent = place.name;
    pill.addEventListener("click", () => {
      if (barSuppressClick) return;
      if (viewbarEditing) return;
      switchView(place.id);
    });
    if (viewbarEditing) {
      const badge = document.createElement("span");
      badge.className = "view-pill-badge";
      badge.innerHTML = ICON_BADGE_CLOSE;
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        runViewbarEditBadge(place);
      });
      pill.appendChild(badge);
    }
    viewbarTrack.appendChild(pill);
  }
}

function setViewbarEditing(editing) {
  if (viewbarEditing === editing) return;
  viewbarEditing = editing;
  renderViewBar();
}

// バッジタップ: 登録ノードは削除確認シートを挟んで削除、組み込みは即座に非表示
// （最後の表示中ビューは toggleInView がガードする）。
function runViewbarEditBadge(place) {
  if (editBadgeAction(place) === "delete") {
    openDeleteConfirm(place.name, () => deletePlace(place.id), DELETE_NOTE_PLACE);
    return;
  }
  togglePlaceView(place.id);
}

function bindViewbarEdit() {
  btnViewbarEdit.addEventListener("click", () => setViewbarEditing(!viewbarEditing));
}

function switchView(next) {
  const target = ensureVisibleView(settings.places, next);
  if (!target || target === view) return;
  view = target;
  settings.lastView = target;
  saveSettings();
  selectedNodeKey = null;
  subtreeStack = [];
  // クロスフェードで切り替える（アニメーションを最初から再生し直す）
  taskList.classList.remove("view-fade");
  void taskList.offsetWidth;
  taskList.classList.add("view-fade");
  render();
  loadCurrentView();
  scrollActivePillIntoView();
  syncHistoryArm(); // ドリルダウン中にビューを切り替えたときの番兵回収
}

function scrollActivePillIntoView() {
  const pill = viewbarTrack.querySelector(".view-pill.active");
  if (pill && pill.scrollIntoView) {
    pill.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
}

// バー上の水平ドラッグ ±44px で隣のビューへ 1 つ移動（1 ドラッグ = 1 移動）
function bindViewBarSwipe() {
  let pointerId = null;
  let startX = 0;
  let consumed = false;

  viewbar.addEventListener("pointerdown", (e) => {
    pointerId = e.pointerId;
    startX = e.clientX;
    consumed = false;
  });

  viewbar.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId || consumed || viewbarEditing) return;
    const step = resolveBarStep(e.clientX - startX);
    if (step !== 0) {
      consumed = true;
      barSuppressClick = true;
      try {
        viewbar.setPointerCapture(e.pointerId);
      } catch {}
      switchView(stepView(settings.places, view, step));
    }
  });

  const finish = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    setTimeout(() => {
      barSuppressClick = false;
    }, 0);
  };
  viewbar.addEventListener("pointerup", finish);
  viewbar.addEventListener("pointercancel", finish);
}

// ==================== Daily view ====================

const DAILY_CACHE_KEY = "taskflowy_daily_cache";
const DAILY_CACHE_TTL_MS = 60 * 1000;

function getDailyCache() {
  try {
    const raw = localStorage.getItem(DAILY_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !Array.isArray(entry.groups)) return null;
    return entry;
  } catch {
    return null;
  }
}

function saveDailyCache() {
  try {
    localStorage.setItem(
      DAILY_CACHE_KEY,
      JSON.stringify({ groups: dailyGroups, hasMore: dailyHasMore, timestamp: dailyFetchedAt || Date.now() })
    );
  } catch {}
}

async function loadDaily(force = false) {
  if (dailyLoading || !isAuthenticated) return;
  const cache = getDailyCache();
  if (cache) {
    dailyGroups = cache.groups;
    dailyHasMore = !!cache.hasMore;
    dailyFetchedAt = cache.timestamp;
    if (view === "daily") render();
    if (!force && Date.now() - cache.timestamp < DAILY_CACHE_TTL_MS) return;
  }

  dailyLoading = true;
  if (view === "daily" && !cache) render(); // spinner
  try {
    const groups = await apiRequest(`/daily?local_date=${localDateString()}`);
    dailyGroups = groups;
    dailyHasMore = groups.length > 0 && !!groups[groups.length - 1].hasMore;
    dailyFetchedAt = Date.now();
    saveDailyCache();
  } catch (e) {
    if (!cache && view === "daily") {
      taskList.innerHTML = `<p class="list-empty">${escapeText(e.message)}</p>`;
      dailyLoading = false;
      return;
    }
    if (force) showToast(e.message, true);
  } finally {
    dailyLoading = false;
  }
  if (view === "daily") render();
}

async function loadDailyMore() {
  if (dailyLoading || !dailyHasMore || dailyGroups.length === 0) return;
  dailyLoading = true;
  render();
  try {
    const last = dailyGroups[dailyGroups.length - 1];
    const groups = await apiRequest(`/daily?before_date=${last.date}`);
    dailyGroups = dailyGroups.map((g) => ({ ...g, hasMore: false })).concat(groups);
    dailyHasMore = groups.length > 0 && !!groups[groups.length - 1].hasMore;
    saveDailyCache();
  } catch (e) {
    showToast(e.message, true);
  } finally {
    dailyLoading = false;
    if (view === "daily") render();
  }
}

function renderDailyView() {
  tabbar.classList.add("hidden");
  btnBack.classList.add("hidden");
  screenTitle.textContent = "Daily";

  if (!isAuthenticated) {
    screenCount.textContent = "";
    taskList.innerHTML = '<p class="list-empty">API キーを設定するとデイリーノートが表示されます。</p>';
    return;
  }

  const showCompleted = showCompletedFor(settings.showCompletedTasks, "daily");
  const groups = visibleDailyGroups(dailyGroups, showCompleted);
  const completedCount = dailyCounts(dailyGroups).items - dailyCounts(visibleDailyGroups(dailyGroups, false)).items;

  const { items, days } = dailyCounts(groups);
  screenCount.textContent = `${items} 件 / ${days} 日`;
  taskList.innerHTML = "";

  if (!dailyGroups.length) {
    taskList.innerHTML = dailyLoading
      ? '<div class="list-loading"><div class="spinner"></div></div>'
      : '<p class="list-empty">デイリーノートはありません</p>';
    return;
  }

  if (completedCount > 0) taskList.appendChild(buildCompletedToggle(completedCount, "daily"));

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "未完了のタスクはありません";
    taskList.appendChild(empty);
    return;
  }

  const today = localDateString();
  for (const group of groups) {
    taskList.appendChild(buildDateHeader(group, group.date === today));

    for (const item of group.items) {
      taskList.appendChild(buildItemRow(item, { showTime: true, origin: "daily" }));
    }
  }

  if (dailyHasMore || dailyLoading) {
    const more = document.createElement("button");
    more.className = "daily-more";
    more.textContent = dailyLoading ? "読み込み中…" : "過去のデイリーノートを読み込む";
    more.disabled = dailyLoading;
    more.addEventListener("click", loadDailyMore);
    taskList.appendChild(more);
  }
}

// ==================== Registered-node views ====================

const NODEVIEW_CACHE_KEY = "taskflowy_nodeview_cache";
const NODEVIEW_CACHE_TTL_MS = 60 * 1000;

function loadNodeViewsCache() {
  try {
    const raw = localStorage.getItem(NODEVIEW_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : null;
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

function saveNodeViewsCache() {
  try {
    // 削除された場所のキャッシュは持ち越さない
    const trimmed = {};
    for (const place of settings.places) {
      if (nodeViews[place.id]) trimmed[place.id] = nodeViews[place.id];
    }
    nodeViews = trimmed;
    localStorage.setItem(NODEVIEW_CACHE_KEY, JSON.stringify(trimmed));
  } catch {}
}

async function loadNodeView(placeId, force = false) {
  const place = settings.places.find((p) => p.id === placeId && p.kind === "node");
  if (!place || !place.ref || nodeViewLoading.has(placeId) || !isAuthenticated) return;
  const cached = nodeViews[placeId];
  if (cached && !force && Date.now() - cached.timestamp < NODEVIEW_CACHE_TTL_MS) return;

  nodeViewLoading.add(placeId);
  try {
    const data = await apiRequest(`/nodes/${encodeURIComponent(place.ref)}/children`);
    nodeViews[placeId] = { items: data.items, timestamp: Date.now() };
    saveNodeViewsCache();
  } catch (e) {
    if (!cached && view === placeId) {
      nodeViewLoading.delete(placeId);
      taskList.innerHTML = `<p class="list-empty">${escapeText(e.message)}</p>`;
      return;
    }
    if (force) showToast(e.message, true);
  } finally {
    nodeViewLoading.delete(placeId);
  }
  if (view === placeId) render();
}

function renderNodeView() {
  tabbar.classList.add("hidden");
  btnBack.classList.add("hidden");
  const place = currentPlace();
  screenTitle.textContent = place ? place.name : "";

  if (!isAuthenticated) {
    screenCount.textContent = "";
    taskList.innerHTML = '<p class="list-empty">API キーを設定するとノードが表示されます。</p>';
    return;
  }

  const entry = nodeViews[view];
  taskList.innerHTML = "";

  if (!entry) {
    screenCount.textContent = "";
    taskList.innerHTML = '<div class="list-loading"><div class="spinner"></div></div>';
    return;
  }

  renderItemListScreen(entry.items, view);
}

// Renders the shared "list of item rows" body used by both the registered
// node view and the subtree drilldown view: completed-count math, empty
// states, the completed-toggle row, and the item rows themselves. Assumes
// taskList has already been cleared and items are fully loaded (callers
// handle their own auth-check / loading-spinner branches beforehand).
function renderItemListScreen(allItems, origin, scope = origin) {
  const showCompleted = showCompletedFor(settings.showCompletedTasks, scope);
  const items = filterCompletedItems(allItems, showCompleted);
  const completedCount = allItems.length - filterCompletedItems(allItems, false).length;

  screenCount.textContent = `${items.length} 件`;
  if (!allItems.length) {
    taskList.innerHTML = '<p class="list-empty">まだ何もありません</p>';
    return;
  }

  if (completedCount > 0) taskList.appendChild(buildCompletedToggle(completedCount, scope));

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "未完了のタスクはありません";
    taskList.appendChild(empty);
    return;
  }

  for (const item of items) {
    taskList.appendChild(buildItemRow(item, { showTime: false, origin }));
  }
}

// ==================== サブツリードリルダウン（任意ノードの子展開） ====================
//
// 行タップで対象ノードの子（1階層）を取得し、子が1件以上あれば新しい画面を
// スタックに重ね開く。子が0件ならその場にトーストを出して留まる。何階層
// でも重ね開けるが、各画面は常に直下の子だけを表示する（登録ノードビューと
// 同じレンダリング・行操作をそのまま再利用する）。

// 子ノードの有無・中身は一覧取得時点では分からないため、行を描画した直後に
// 各行が自分で /nodes/:id/children を取得してプレビューを差し込む（子が
// 無ければ何も出さない）。プレビュー自体がタップ領域を兼ね、サブツリー
// ドリルダウンへの入口になる。行本体のタップは詳細シートに使うため、
// クリックはここで止める。
const CHILD_PREVIEW_LIMIT = 3;

async function bindChildPreview(body, nodeId, title) {
  let preview;
  try {
    const data = await apiRequest(`/nodes/${encodeURIComponent(nodeId)}/children`);
    if (!data.items.length) return;
    const names = data.items
      .slice(0, CHILD_PREVIEW_LIMIT)
      .map((child) => normalizeTitle(child.plainName) || "（無題）")
      .join(" ・ ");
    preview = document.createElement("button");
    preview.type = "button";
    preview.className = "child-preview";
    preview.innerHTML = `<span class="child-preview-text"></span><span class="child-preview-chevron" aria-hidden="true">›</span>`;
    preview.querySelector(".child-preview-text").textContent = names;
  } catch {
    return; // プレビューは補助表示なので、失敗しても静かに諦める
  }
  preview.addEventListener("click", (e) => {
    e.stopPropagation();
    expandSubtree(nodeId, title);
  });
  body.appendChild(preview);
}

async function expandSubtree(nodeId, title) {
  if (subtreeLoading) return;
  subtreeLoading = true;
  try {
    const data = await apiRequest(`/nodes/${encodeURIComponent(nodeId)}/children`);
    if (!data.items.length) {
      showToast("子ノードはありません");
      return;
    }
    subtreeStack.push({ nodeId, title, items: data.items });
    render();
    armHistory();
  } catch (e) {
    showToast(e.message, true);
  } finally {
    subtreeLoading = false;
  }
}

function popSubtree() {
  subtreeStack.pop();
  render();
}

function renderSubtreeView() {
  tabbar.classList.add("hidden");
  btnBack.classList.remove("hidden");
  const frame = subtreeStack[subtreeStack.length - 1];
  screenTitle.textContent = frame.title;
  taskList.innerHTML = "";

  renderItemListScreen(frame.items, "subtree", `subtree:${frame.nodeId}`);
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
  // ドリルダウンは 'nodes' スコープ、Today/Deadlines はタブごとに独立
  const scope = node ? "nodes" : tab;
  const showCompleted = showCompletedFor(settings.showCompletedTasks, scope);
  const groups = node
    ? groupNodeTasks(node.tasks, showCompleted)
    : groupTasksForView(tasksState, tab, today, showCompleted, dueCompletedPages);
  dueDoneHasMore =
    !node && tab === "due" && showCompleted && !!groups.find((g) => g.key === "done")?.hasMore;
  const openCount = groups.reduce((n, g) => n + g.tasks.filter((t) => !t.completed).length, 0);
  screenCount.textContent = `${openCount} 件`;

  // このビューに属する完了済みタスクの数（非表示中でもボタンの件数に出す）
  const completedCount = node ? node.done : countCompletedForView(tasksState, tab, today);
  if (completedCount > 0) taskList.appendChild(buildCompletedToggle(completedCount, scope));

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "タスクはありません";
    taskList.appendChild(empty);
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

  // 完了グループがリスト下端に届いていなければ画面が埋まるまで自動で追い読み
  // （以降はスクロール下端で 7 日分ずつ。Daily と同じ形）
  if (dueDoneHasMore && taskList.scrollHeight <= taskList.clientHeight) {
    setTimeout(loadMoreCompletedDue, 0);
  }
}

// Deadlines 完了グループの追い読み。次の 7 日ウィンドウへ広げる。完了が
// 1 件も無い週はスキップして、必ず表示件数が増えるところまで進める。
function loadMoreCompletedDue() {
  if (!dueDoneHasMore || view !== "tasks" || tab !== "due") return;
  const today = localDateString();
  const current = completedTasksForDueView(tasksState, today, dueCompletedPages);
  if (!current.hasMore) return;
  let pages = dueCompletedPages;
  let next;
  do {
    pages += 1;
    next = completedTasksForDueView(tasksState, today, pages);
  } while (next.hasMore && next.tasks.length === current.tasks.length);
  dueCompletedPages = pages;
  render();
}

function renderNodeList() {
  const allNodes = summarizeNodes(tasksState);
  const showFinished = settings.showFinishedNodes === true;
  const nodes = filterFinishedNodes(allNodes, showFinished);
  const hiddenCount = allNodes.length - nodes.length;
  screenCount.textContent = `${nodes.length} ノード`;

  const toggle = document.createElement("button");
  toggle.className = "node-filter" + (showFinished ? " active" : "");
  toggle.textContent = showFinished ? "完了済みを隠す" : `完了済みを表示${hiddenCount ? ` (${hiddenCount})` : ""}`;
  toggle.addEventListener("click", () => {
    settings.showFinishedNodes = !showFinished;
    saveSettings();
    render();
  });
  taskList.appendChild(toggle);

  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = hiddenCount ? "未完了のタスクを持つノードはありません" : "タスクはありません";
    taskList.appendChild(empty);
    return;
  }

  const container = document.createElement("div");
  container.className = "node-list";

  for (const node of nodes) {
    const row = document.createElement("button");
    row.className = "node-row";
    const ring = node.hasOverdue ? "#e39098" : "#e6e8ec";
    const track = node.hasOverdue ? "rgba(227,144,152,.28)" : "rgba(230,232,236,.16)";
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
      armHistory();
    });
    container.appendChild(row);
  }

  taskList.appendChild(container);
}

// サブツリー展開への入口（子の有無は事前判定しない。無ければ expandSubtree
// 側がトーストを出す）。行タップは詳細シートに使うため独立したボタンにする。
function buildExpandChevron(onExpand) {
  const chevron = document.createElement("button");
  chevron.type = "button";
  chevron.className = "row-expand-chevron";
  chevron.title = "子を展開";
  chevron.textContent = "›";
  chevron.addEventListener("click", (e) => {
    e.stopPropagation();
    onExpand();
  });
  return chevron;
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

  row.appendChild(buildExpandChevron(() => expandSubtree(task.id, normalizeTitle(task.plainName) || "（無題）")));

  wrap.appendChild(row);
  applyRowState(row, task);

  check.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleComplete(task, row);
  });

  bindRowSwipe(wrap, row, {
    onToggleComplete: () => toggleComplete(task, row),
    onDelete: () =>
      openDeleteConfirm(normalizeTitle(task.plainName) || "（無題）", () => deleteTask(task, wrap, row)),
    onTap: () => openSheetFor(task, "tasks"),
  });
  return wrap;
}

// Daily の日付見出し。日付も Workflowy 上のノードなので、項目行と同じ操作対象
// として扱う: タップで詳細シート、左スワイプでその日ごと削除。右スワイプ（完了）
// は日付に完了の概念がないため持たせない。
function buildDateHeader(group, isToday) {
  const wrap = document.createElement("div");
  wrap.className = "date-header-wrap task-row-wrap";
  wrap.dataset.date = group.date;

  const underlay = document.createElement("div");
  underlay.className = "task-row-underlay";
  underlay.innerHTML = '<span class="underlay-complete"></span><span class="underlay-delete">この日ごと削除</span>';
  wrap.appendChild(underlay);

  const row = document.createElement("button");
  row.type = "button";
  row.className = "date-header-row" + (isToday ? " today" : "");

  const { date, weekday } = dailyDateParts(group.date);
  row.innerHTML =
    '<span class="date-header-date"></span>' +
    '<span class="date-header-weekday"></span>' +
    '<span class="date-header-rule"></span>' +
    '<span class="date-header-count"></span>' +
    '<span class="date-header-chevron" aria-hidden="true">›</span>';
  row.querySelector(".date-header-date").textContent = date;
  row.querySelector(".date-header-weekday").textContent = weekday;
  row.querySelector(".date-header-count").textContent = String(group.items.length);

  wrap.appendChild(row);

  bindRowSwipe(wrap, row, {
    deleteOnly: true,
    onDelete: () =>
      openDeleteConfirm(dailyNoteTitle(group.date), () => deleteDailyNote(group.date, wrap, row), DELETE_NOTE_DAY),
    onTap: () => openDailyNoteSheet(group),
  });
  return wrap;
}

// Daily / 登録ノードビューの行（タスクもメモも同じ操作を持つ）。
// showTime: Daily のみ時刻の左カラムを出す。origin: 'daily' | <place id>。
function buildItemRow(item, { showTime, origin }) {
  const wrap = document.createElement("div");
  wrap.className = "task-row-wrap";
  wrap.dataset.taskId = item.id;

  const underlay = document.createElement("div");
  underlay.className = "task-row-underlay";
  underlay.innerHTML = '<span class="underlay-complete">✓ 完了</span><span class="underlay-delete">削除</span>';
  wrap.appendChild(underlay);

  const row = document.createElement("div");
  row.className = "task-row";

  if (showTime) {
    row.classList.add("has-time");
    const time = document.createElement("div");
    time.className = "memo-time";
    time.textContent = itemTimeLabel(item.createdAt);
    row.appendChild(time);
  }

  const body = document.createElement("div");
  body.className = "task-row-body";

  const name = document.createElement("div");
  name.className = "memo-name";
  name.textContent = normalizeTitle(item.plainName) || "（無題）";
  body.appendChild(name);

  // タスクであることは本文の下のタグだけで示す。タグのタップで完了トグル。
  if (item.todo) {
    const tagRow = document.createElement("div");
    tagRow.className = "item-tag-row";
    const tag = document.createElement("button");
    tag.className = "item-tag";
    tag.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleItemComplete(item, row, origin);
    });
    tagRow.appendChild(tag);
    if (item.due) {
      const due = document.createElement("span");
      due.className = "item-tag-due";
      due.textContent = formatDueShort(item.due, localDateString());
      tagRow.appendChild(due);
    }
    body.appendChild(tagRow);
  }

  row.appendChild(body);
  wrap.appendChild(row);
  applyItemRowState(row, item);

  bindChildPreview(body, item.id, normalizeTitle(item.plainName) || "（無題）");

  bindRowSwipe(wrap, row, {
    onToggleComplete: () => toggleItemComplete(item, row, origin),
    onDelete: () =>
      openDeleteConfirm(normalizeTitle(item.plainName) || "（無題）", () => deleteItem(item, wrap, row, origin)),
    onTap: () => openSheetFor(item, origin),
  });
  return wrap;
}

function applyItemRowState(row, item) {
  row.classList.toggle("done", !!item.completed);
  const tag = row.querySelector(".item-tag");
  if (tag) {
    tag.textContent = item.completed ? "DONE" : "TODO";
    tag.classList.toggle("done", !!item.completed);
  }
  const due = row.querySelector(".item-tag-due");
  if (due) {
    const overdue = !item.completed && classifyDue(item.due, localDateString()) === "overdue";
    due.classList.toggle("overdue", overdue);
  }
  const underlayComplete = row.parentElement?.querySelector(".underlay-complete");
  if (underlayComplete) underlayComplete.textContent = item.completed ? "↩ 未完了" : "✓ 完了";
}

function applyRowState(row, task) {
  const overdue = !task.completed && classifyDue(task.due, localDateString()) === "overdue";
  row.classList.toggle("done", !!task.completed);
  row.classList.toggle("overdue", overdue);
  row.querySelector(".task-check").textContent = task.completed ? "✓" : "";
  // Right swipe toggles: the underlay label mirrors what it will do.
  const underlayComplete = row.parentElement?.querySelector(".underlay-complete");
  if (underlayComplete) underlayComplete.textContent = task.completed ? "↩ 未完了" : "✓ 完了";
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

// 行の所属ビューごとのキャッシュ書き戻し
function persistOriginCache(origin) {
  if (origin === "tasks") setTasksCache(tasksState);
  else if (origin === "daily") saveDailyCache();
  else if (origin === "subtree") return; // メモリ上のみ、永続化しない
  else saveNodeViewsCache();
}

async function toggleItemComplete(item, row, origin) {
  const target = !item.completed;
  item.completed = target;
  if (row) applyItemRowState(row, item);
  persistOriginCache(origin);
  try {
    await apiRequest(`/nodes/${encodeURIComponent(item.id)}/${target ? "complete" : "uncomplete"}`, {
      method: "POST",
    });
  } catch (e) {
    item.completed = !target;
    if (row) applyItemRowState(row, item);
    persistOriginCache(origin);
    showToast(e.message, true);
  }
}

function animateRemove(wrap) {
  if (!wrap) return;
  wrap.style.maxHeight = `${wrap.offsetHeight}px`;
  wrap.classList.add("removing");
  requestAnimationFrame(() => {
    wrap.style.maxHeight = "0";
    wrap.style.opacity = "0";
  });
}

function restoreRemove(wrap, row) {
  if (!wrap) return;
  wrap.classList.remove("removing");
  wrap.style.maxHeight = "";
  wrap.style.opacity = "";
  if (row) row.style.transform = "";
}

async function deleteTask(task, wrap, row) {
  animateRemove(wrap);
  try {
    await apiRequest(`/nodes/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    tasksState = tasksState.filter((t) => t.id !== task.id);
    setTasksCache(tasksState);
    if (wrap) setTimeout(() => wrap.remove(), 220);
    else render();
    showToast("削除しました");
  } catch (e) {
    restoreRemove(wrap, row);
    showToast(e.message, true);
  }
}

function removeItemFromOrigin(id, origin) {
  if (origin === "daily") {
    // ノートが 0 件になった日は見出しごと消す
    dailyGroups = dailyGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.id !== id) }))
      .filter((g) => g.items.length > 0);
    saveDailyCache();
  } else if (origin === "subtree") {
    const top = subtreeStack[subtreeStack.length - 1];
    if (top) top.items = top.items.filter((i) => i.id !== id);
  } else if (nodeViews[origin]) {
    nodeViews[origin] = {
      ...nodeViews[origin],
      items: nodeViews[origin].items.filter((i) => i.id !== id),
    };
    saveNodeViewsCache();
  }
}

// 日付ノードごと削除する。日付キー（YYYY-MM-DD）はそのままノード識別子として
// 使える。その日のブロックがまとめて消えるので、行だけ畳まず一覧を描き直す。
async function deleteDailyNote(date, wrap, row) {
  animateRemove(wrap);
  try {
    await apiRequest(`/nodes/${encodeURIComponent(date)}`, { method: "DELETE" });
    dailyGroups = dailyGroups.filter((g) => g.date !== date);
    saveDailyCache();
    render();
    showToast("削除しました");
  } catch (e) {
    restoreRemove(wrap, row);
    showToast(e.message, true);
  }
}

async function deleteItem(item, wrap, row, origin) {
  animateRemove(wrap);
  try {
    await apiRequest(`/nodes/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    removeItemFromOrigin(item.id, origin);
    if (wrap) setTimeout(() => wrap.remove(), 220);
    else render();
    showToast("削除しました");
  } catch (e) {
    restoreRemove(wrap, row);
    showToast(e.message, true);
  }
}

// Sets the due date ({ date, time? }) or clears it (dateStr = null).
async function scheduleEntity(entity, dateStr, timeStr, origin) {
  await apiRequest(`/nodes/${encodeURIComponent(entity.id)}/schedule`, {
    method: "POST",
    body: JSON.stringify({ date: dateStr, time: timeStr || undefined }),
  });
  entity.due = dateStr ? { date: dateStr, time: timeStr || null } : null;
  persistOriginCache(origin);
  render();
}

function scheduleTask(task, dateStr, timeStr) {
  return scheduleEntity(task, dateStr, timeStr, "tasks");
}

// Swipe (Pointer Events, so both touch and mouse drag work): right =
// complete toggle, left = delete confirmation, tap = detail sheet. Shared by
// every row in every view (tasks and memos are the same Workflowy nodes).
// Direction is locked in on the first move past the threshold; vertical pans
// stay with the browser via touch-action. handlers.deleteOnly drops the right
// swipe for rows with no completed state (the Daily date headings). Subtree
// expansion (a row's children) is a separate affordance (the chevron button),
// not part of this gesture set -- a long-press variant was tried and dropped
// because Chrome for Android's own touch-and-hold handling swallowed it
// before our handler saw it.
function bindRowSwipe(wrap, row, handlers) {
  const deleteOnly = !!handlers.deleteOnly;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let direction = null; // "horizontal" | "vertical" | null
  let dragging = false;
  let suppressClick = false;

  row.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    direction = null;
    dragging = false;
  });

  row.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointerId) return;
    const curDx = e.clientX - startX;
    const curDy = e.clientY - startY;

    if (!direction) {
      direction = swipeDirection(curDx, curDy, 10);
      if (direction === "horizontal") {
        try {
          row.setPointerCapture(e.pointerId);
        } catch {}
        row.classList.add("dragging");
      }
    }
    if (direction !== "horizontal") return;

    dragging = true;
    dx = clampDx(curDx, { deleteOnly });
    row.style.transform = `translateX(${dx}px)`;
    // 背面の色: 方向としきい値到達で濃さを変える（反対側のラベルは消す）
    wrap.classList.toggle("swipe-right", dx > 0);
    wrap.classList.toggle("swipe-left", dx < 0);
    wrap.classList.toggle("past-threshold", resolveSwipeAction(dx, { deleteOnly }) !== null);
  });

  const finish = (e, commit) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    row.classList.remove("dragging");
    wrap.classList.remove("swipe-right", "swipe-left", "past-threshold");
    if (dragging) {
      // The click event fires right after pointerup; swallow it once.
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 0);
      const action = commit ? resolveSwipeAction(dx, { deleteOnly }) : null;
      snapBack(row);
      if (action === "complete") {
        handlers.onToggleComplete(); // toggle: right swipe on a completed row uncompletes
      } else if (action === "delete") {
        handlers.onDelete();
      }
    }
    direction = null;
    dragging = false;
    dx = 0;
  };

  row.addEventListener("pointerup", (e) => finish(e, true));
  row.addEventListener("pointercancel", (e) => finish(e, false));

  // Tap/click (no drag) opens the detail sheet
  row.addEventListener("click", (e) => {
    if (suppressClick) {
      e.preventDefault();
      return;
    }
    handlers.onTap();
  });
}

function snapBack(row) {
  row.classList.add("snapping");
  row.style.transform = "";
  setTimeout(() => row.classList.remove("snapping"), 200);
}

// ==================== Detail sheet ====================

// タスクとメモで中身を分ける: タスクは定義リスト、メモは読むための画面
// （時刻 · 場所、大きめタイトル、note の面）。
function fillSheet() {
  const entity = sheetTask;
  const today = localDateString();

  sheetTaskTitle.textContent = normalizeTitle(entity.plainName) || "（無題）";
  sheetTaskTitle.classList.toggle("memo", sheetIsMemo || !!sheetDate);
  // 日付ノードの名前は日付キーそのものなので編集させない
  sheetTaskTitle.classList.toggle("editable", !sheetDate);
  sheetItemMeta.classList.toggle("hidden", !sheetIsMemo && !sheetDate);
  sheetTaskProps.classList.toggle("hidden", sheetIsMemo || !!sheetDate);
  // note が空でもクリックして書き足せるよう、メモレイアウトでは面を常に出す
  sheetItemNote.classList.toggle("hidden", !sheetIsMemo);
  btnSnoozeTomorrow.classList.toggle("hidden", sheetIsMemo || !!sheetDate);
  btnSheetComplete.classList.toggle("hidden", !!sheetDate);
  btnSheetLayout.classList.toggle("hidden", !!sheetDate);
  // 日付ノードの id は日付キーで workflowyUrl の対象外なので共有ボタンごと隠す
  btnSheetShare.classList.toggle("hidden", !!sheetDate);
  btnSheetLayout.textContent = layoutActionLabel(!sheetIsMemo);
  sheetActions.classList.toggle("only-delete", !!sheetDate);

  if (sheetDate) {
    // 日付ノードには完了の概念がないので「完了にする」は出さない
    sheetItemMeta.textContent = "デイリーノート";
  } else if (sheetIsMemo) {
    const time = sheetOrigin === "daily" ? `${itemTimeLabel(entity.createdAt)} · ` : "";
    sheetItemMeta.textContent = `${time}${placeLabelForOrigin(sheetOrigin)}`;
    sheetItemNote.textContent = entity.note ? stripHtml(entity.note) : "メモを追加";
    sheetItemNote.classList.toggle("empty", !entity.note);
  } else {
    sheetTaskDue.textContent = formatDueDetail(entity.due, today);
    sheetTaskDue.classList.toggle("overdue", !entity.completed && classifyDue(entity.due, today) === "overdue");
    sheetTaskDue.classList.toggle("none", !entity.due);
    sheetTaskNode.textContent =
      sheetOrigin === "tasks"
        ? entity.parentPath && entity.parentPath.length
          ? normalizeTitle(entity.parentPath[entity.parentPath.length - 1])
          : "—"
        : placeLabelForOrigin(sheetOrigin) || "—";
    sheetTaskNote.textContent = entity.note ? stripHtml(entity.note) : "—";
  }

  sheetTaskLink.href = workflowyUrl(entity.id);
  btnSheetComplete.textContent = entity.completed ? "未完了に戻す" : "完了にする";
  btnSheetComplete.classList.toggle("primary", !entity.completed);
}

function openSheetFor(entity, origin) {
  sheetTask = entity;
  sheetOrigin = origin;
  sheetDate = null;
  sheetIsMemo = origin !== "tasks" && !entity.todo;
  showSheet();
}

// 日付ノードの詳細シート。ノード ID の代わりに日付キーをそのまま使う
// （Workflowy API が日付キーを識別子として受ける）。
function openDailyNoteSheet(group) {
  sheetTask = { id: group.date, plainName: dailyNoteTitle(group.date), note: null, completed: false };
  sheetOrigin = "daily";
  sheetDate = group.date;
  sheetIsMemo = false;
  showSheet();
}

function showSheet() {
  fillSheet();
  sheetDueEditor.classList.add("hidden");
  sheetTaskEl.classList.remove("hidden");
  armHistory();
}

function toggleDueEditor() {
  if (!sheetTask) return;
  const opening = sheetDueEditor.classList.contains("hidden");
  sheetDueEditor.classList.toggle("hidden", !opening);
  if (opening) {
    sheetDateInput.value = sheetTask.due ? sheetTask.due.date : "";
    sheetTimeInput.value = sheetTask.due && sheetTask.due.time ? sheetTask.due.time : "";
  }
}

// Applies a due change from the detail sheet editor and refreshes the view.
async function applySheetDue(dateStr, timeStr) {
  if (!sheetTask) return;
  const entity = sheetTask;
  try {
    await scheduleEntity(entity, dateStr, timeStr, sheetOrigin);
    fillSheet();
    sheetDueEditor.classList.add("hidden");
    showToast(dateStr ? "期限を設定しました" : "期限を解除しました");
  } catch (e) {
    showToast(e.message, true);
  }
}

// ---- インライン編集（contenteditable） ----
//
// タイトル・メモは別枠のエディタを開かず、表示している面をそのまま書き換える。
// フォーカスが外れたら保存し、Escape で取り消す。単一行（タイトル）は Enter でも
// 確定する。値が変わっていなければ API は呼ばない。

let inlineEditing = null; // { el, original } 編集中の面

// 編集中の面があれば確定させる。シートを閉じる/別の操作へ移る前に呼ぶ。
function commitInlineEdit() {
  if (inlineEditing) inlineEditing.el.blur();
}

function bindInlineEdit(el, { multiline, placeholder, currentValue, save }) {
  el.dataset.placeholder = placeholder;

  el.addEventListener("click", () => {
    if (!sheetTask || sheetDate || inlineEditing) return;
    const original = currentValue();
    el.textContent = original;
    el.contentEditable = "plaintext-only";
    el.classList.add("inline-editing");
    inlineEditing = { el, original };
    el.focus();
    // キャレットは末尾に置く（クリック位置に合わせず、素直に続きから打てるように）
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      el.textContent = inlineEditing ? inlineEditing.original : el.textContent;
      inlineEditing = null;
      el.contentEditable = "false";
      el.classList.remove("inline-editing");
      fillSheet();
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      el.blur();
    }
  });

  el.addEventListener("blur", async () => {
    if (!inlineEditing || inlineEditing.el !== el) return;
    const { original } = inlineEditing;
    inlineEditing = null;
    el.contentEditable = "false";
    el.classList.remove("inline-editing");
    const value = el.textContent;
    if (value !== original) {
      // シートを閉じながらの確定もあるので、対象は今のうちに捕まえておく
      const entity = sheetTask;
      const origin = sheetOrigin;
      try {
        await save(entity, origin, value);
      } catch (err) {
        showToast(err.message, true);
      }
    }
    if (sheetTask) fillSheet();
  });
}

// 名前はサーバ側で <time> 期限マークアップを付け直すので、送るのは表示テキスト
// だけでよい。名前は一覧の行にも出るので保存後は render() まで回す。
async function saveSheetTitle(entity, origin, name) {
  const trimmed = name.trim();
  if (!trimmed) {
    showToast("タイトルは空にできません", true);
    return;
  }
  await apiRequest(`/nodes/${encodeURIComponent(entity.id)}/name`, {
    method: "POST",
    body: JSON.stringify({ name: trimmed }),
  });
  // 表示に使われるのは plainName だけ（raw name は <time> 込みでサーバ側の値が正）
  entity.plainName = trimmed;
  persistOriginCache(origin);
  render();
  showToast("タイトルを保存しました");
}

async function saveSheetNote(entity, origin, note) {
  await apiRequest(`/nodes/${encodeURIComponent(entity.id)}/note`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  entity.note = note || null;
  persistOriginCache(origin);
  render();
  showToast("メモを保存しました");
}

// note ⇄ todo（Workflowy の layoutMode）。Tasks ビューは layoutMode="todo" の
// ノードだけを集めた一覧なので、メモに変えたら tasksState からも外す。
async function toggleSheetLayout() {
  if (!sheetTask || sheetDate) return;
  commitInlineEdit();
  const entity = sheetTask;
  const origin = sheetOrigin;
  const wasTodo = !sheetIsMemo;
  btnSheetLayout.disabled = true;
  try {
    await apiRequest(`/nodes/${encodeURIComponent(entity.id)}/layout`, {
      method: "POST",
      body: JSON.stringify({ todo: !wasTodo }),
    });

    if (wasTodo) {
      // タスク → メモ: Tasks ビューの対象から外れる
      tasksState = tasksState.filter((t) => t.id !== entity.id);
    } else if (!tasksState.some((t) => t.id === entity.id)) {
      // メモ → タスク: Tasks ビューに載る。親のパスは次の取得で埋まる
      tasksState = [
        {
          id: entity.id,
          name: entity.name,
          plainName: entity.plainName,
          note: entity.note,
          parentId: null,
          parentPath: [placeLabelForOrigin(origin)].filter(Boolean),
          createdAt: entity.createdAt || Math.floor(Date.now() / 1000),
          completedAt: null,
          due: entity.due || null,
          completed: !!entity.completed,
        },
        ...tasksState,
      ];
    }
    setTasksCache(tasksState);

    if (origin === "tasks") {
      // Tasks ビューはタスクだけの一覧なので、メモにした行はもう出せない
      closeViaBack();
    } else {
      entity.todo = !wasTodo;
      persistOriginCache(origin);
      sheetIsMemo = !entity.todo;
      fillSheet();
    }
    render();
    showToast(wasTodo ? "メモにしました" : "タスクにしました");
  } catch (e) {
    showToast(e.message, true);
  } finally {
    btnSheetLayout.disabled = false;
  }
}

// ==================== 共有 ====================

function openShareSheet() {
  if (!sheetTask || sheetDate) return;
  sheetShareEl.classList.remove("hidden");
  armHistory();
}

// navigator.share 非対応（主に非セキュアコンテキストやデスクトップ Safari 系）
// ではクリップボードへコピーする。
async function shareContent(payload) {
  if (navigator.share) {
    try {
      await navigator.share(payload);
    } catch (e) {
      if (e.name !== "AbortError") showToast("共有できませんでした", true);
      return;
    }
  } else {
    try {
      await navigator.clipboard.writeText(payload.url || payload.text);
      showToast("クリップボードにコピーしました");
    } catch {
      showToast("コピーできませんでした", true);
      return;
    }
  }
  closeViaBack();
}

async function shareSheetTaskAsUrl() {
  if (!sheetTask) return;
  const entity = sheetTask;
  await shareContent({ title: normalizeTitle(entity.plainName) || "（無題）", url: workflowyUrl(entity.id) });
}

async function shareSheetTaskAsText() {
  if (!sheetTask) return;
  const entity = sheetTask;
  const title = normalizeTitle(entity.plainName) || "（無題）";
  await shareContent({ title, text: shareText(title, entity.note) });
}

// ==================== 戻るボタン統合 ====================
//
// シート/設定/ドリルダウンを開くとき番兵の履歴エントリを 1 つ積み、
// popstate（戻るボタン）で最前面のレイヤーを 1 つだけ閉じる。レイヤーが
// まだ残っていれば積み直す。UI 上の閉じる操作は history.back() に流して
// 履歴と画面の状態を同期させる。何も開いていないときの戻るはアプリを出る。

let historyArmed = false;

function uiLayerFlags() {
  const composeOpen = !sheetAddEl.classList.contains("hidden");
  return {
    shareOpen: !sheetShareEl.classList.contains("hidden"),
    deleteOpen: !sheetDeleteEl.classList.contains("hidden"),
    pickerOpen: composeOpen && !composePicker.classList.contains("hidden"),
    detailOpen: !sheetTaskEl.classList.contains("hidden"),
    subtreeOpen: subtreeStack.length > 0,
    composeOpen,
    settingsOpen: !screenSettings.classList.contains("hidden"),
    drilldown: view === "tasks" && tab === "nodes" && !!selectedNodeKey,
  };
}

function armHistory() {
  if (historyArmed) return;
  historyArmed = true;
  history.pushState({ taskflowy: true }, "");
}

function closeTopLayer() {
  const layer = topUiLayer(uiLayerFlags());
  if (layer === "share") {
    sheetShareEl.classList.add("hidden");
  } else if (layer === "delete") {
    sheetDeleteEl.classList.add("hidden");
    pendingDelete = null;
  } else if (layer === "picker") {
    closePicker();
  } else if (layer === "detail") {
    // 編集中の面は捨てずに確定させる（blur ハンドラが sheetTask を読むので先に）
    commitInlineEdit();
    sheetTaskEl.classList.add("hidden");
    sheetTask = null;
    sheetDate = null;
  } else if (layer === "subtree") {
    popSubtree();
  } else if (layer === "compose") {
    sheetAddEl.classList.add("hidden");
  } else if (layer === "settings") {
    screenSettings.classList.add("hidden");
  } else if (layer === "drilldown") {
    selectedNodeKey = null;
    render();
  }
  return layer !== null;
}

// UI の閉じるボタン/背景タップ: 戻るボタンと同じ経路で最前面を閉じる
function closeViaBack() {
  if (historyArmed) history.back();
  else closeTopLayer();
}

// history を介さずレイヤーを閉じたあと、何も残っていなければ番兵を回収する
function syncHistoryArm() {
  if (historyArmed && !topUiLayer(uiLayerFlags())) history.back();
}

function bindBackButton() {
  window.addEventListener("popstate", () => {
    if (!historyArmed) return; // 番兵より前の履歴操作（こちらでは何も開いていない）
    historyArmed = false;
    if (closeTopLayer() && topUiLayer(uiLayerFlags())) armHistory();
  });
}

// ==================== Delete confirmation ====================

const DELETE_NOTE_NODE = "Workflowy 側のノードも削除されます。元に戻せません。";
const DELETE_NOTE_DAY = "その日のノートごと Workflowy 側から削除されます。元に戻せません。";
const DELETE_NOTE_PLACE = "この場所をビューから削除します。Workflowy 側のノードは残ります。";

// note: 日付ノードのように「何が一緒に消えるか」が行の見た目から読めない場合だけ
// 文面を差し替える。
function openDeleteConfirm(title, run, note) {
  pendingDelete = { run };
  sheetDeleteTitle.textContent = title;
  sheetDeleteNote.textContent = note || DELETE_NOTE_NODE;
  sheetDeleteEl.classList.remove("hidden");
  armHistory();
}

function confirmDelete() {
  if (!pendingDelete) return;
  const { run } = pendingDelete;
  pendingDelete = null;
  sheetDeleteEl.classList.add("hidden");
  syncHistoryArm();
  run();
}

// ==================== Compose sheet ====================

const ICON_CALENDAR = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const ICON_FOLDER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;

function destIconSvg(dest, size = 16) {
  const svg = !dest || dest.kind === "daily" ? ICON_CALENDAR : ICON_FOLDER;
  return svg.replace('width="16" height="16"', `width="${size}" height="${size}"`);
}

let composeMode = "task"; // 'task' | 'note'
let composeContinuous = false; // 連続追加。シートを開くたび OFF に戻る
let composeDest = null; // views.js の ComposeDest
let pickerCustomDay = false; // セレクタで「日付…」チップを選んでいるか
let composeTreeLoaded = false;

// 入力欄と期限だけを初期状態に戻す（モードと書き込み先は保つ）
function resetComposeInputs() {
  taskNameInput.value = "";
  noteInput.value = "";
  taskDateInput.value = "";
  taskTimeInput.value = "";
  addDue = "today";
  renderDueChips();
}

// draftNote: 他アプリからの共有（Web Share Target）で事前入力するノート本文。
// 共有内容はタイトル/URLが分かれておらず自由記述に近いため、常にノートモードで開く。
function openAddSheet(draftNote) {
  composeMode = draftNote ? "note" : initialComposeMode(settings.composeMode); // 前回使ったモードで開く
  composeContinuous = false; // 連続追加は毎回 OFF から
  // 既定の書き込み先は表示中のビューに対応する場所（Tasks ビューは Daily 今日）
  composeDest = composeDestForView(view, settings.places);
  pickerCustomDay = false;
  composePicker.classList.add("hidden");
  composeMain.classList.remove("hidden");
  renderCompose();
  resetComposeInputs();
  if (draftNote) noteInput.value = draftNote;
  sheetAddEl.classList.remove("hidden");
  armHistory();
  (composeMode === "task" ? taskNameInput : noteInput).focus();
}

function renderCompose() {
  composeModebar.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === composeMode);
  });
  const isTask = composeMode === "task";
  composeDestRow.classList.toggle("hidden", !isTask);
  composeTaskBody.classList.toggle("hidden", !isTask);
  composeNoteBody.classList.toggle("hidden", isTask);

  const label = destLabel(composeDest, settings.places);
  composeDestName.textContent = label;
  composeDestIcon.innerHTML = destIconSvg(composeDest, 16);
  composeDestSmallName.textContent = label;
  composeDestSmallIcon.innerHTML = destIconSvg(composeDest, 13);

  btnContinuousTask.classList.toggle("active", composeContinuous);
  btnContinuousNote.classList.toggle("active", composeContinuous);

  const posLabel = positionLabel(settings.composePosition);
  btnPosTask.textContent = posLabel;
  btnPosNote.textContent = posLabel;
}

function renderDueChips() {
  // A custom date/time entry overrides (and deselects) the chips.
  const custom = !!(taskDateInput.value || taskTimeInput.value);
  sheetAddEl.querySelectorAll(".due-chip").forEach((chip) => {
    chip.classList.toggle("active", !custom && chip.dataset.due === addDue);
  });
}

// Due for a new task: custom date/time wins over the chips. A time without
// a date means today at that time.
function resolveAddDue() {
  const date = taskDateInput.value;
  const time = taskTimeInput.value;
  if (date || time) {
    return { date: date || localDateString(), time: time || null };
  }
  const due = dueShortcut(addDue);
  return due ? { date: due.date, time: null } : null;
}

// ---- 送信先セレクタ（シート内で本体と入れ替える） ----

function openPicker() {
  composeMain.classList.add("hidden");
  composePicker.classList.remove("hidden");
  armHistory();
  if (!composeTreeLoaded) {
    composeTreeLoaded = true;
    composeNodeTree.load();
  }
  renderPicker();
}

function closePicker() {
  composePicker.classList.add("hidden");
  composeMain.classList.remove("hidden");
  renderCompose();
  (composeMode === "task" ? taskNameInput : noteInput).focus();
}

function renderPicker() {
  const todayStr = localDateString();
  // 書き込み先がノードのときは日付の概念が無いので Daily チップは選択されない
  const dayValue = composeDest && composeDest.kind === "daily" ? composeDest.day || todayStr : null;
  const chipDates = { today: todayStr, tomorrow: addDays(todayStr, 1), week: nextMonday(todayStr) };

  pickerDailyChips.querySelectorAll(".picker-day").forEach((chip) => {
    const key = chip.dataset.day;
    const active =
      dayValue !== null && (key === "custom" ? pickerCustomDay : !pickerCustomDay && chipDates[key] === dayValue);
    chip.classList.toggle("active", active);
  });
  pickerDateInput.classList.toggle("hidden", !(dayValue !== null && pickerCustomDay));
  if (dayValue !== null && pickerCustomDay) pickerDateInput.value = dayValue;


  pickerPlaces.innerHTML = "";
  const nodePlaces = settings.places.filter((p) => p.kind === "node");
  if (!nodePlaces.length) {
    pickerPlaces.innerHTML = '<p class="picker-empty">登録済みの場所はありません</p>';
  }
  for (const place of nodePlaces) {
    const selected = composeDest && composeDest.kind === "place" && composeDest.placeId === place.id;
    const btn = document.createElement("button");
    btn.className = "picker-place" + (selected ? " selected" : "");
    btn.innerHTML =
      `<span class="compose-dest-icon">${ICON_FOLDER}</span><span class="picker-place-name"></span>` +
      (selected ? '<span class="picker-check">✓</span>' : "");
    btn.querySelector(".picker-place-name").textContent = place.name;
    btn.addEventListener("click", () => {
      composeDest = { kind: "place", placeId: place.id };
      pickerCustomDay = false;
      renderPicker();
    });
    pickerPlaces.appendChild(btn);
  }
}

// ---- 送信 ----

// 送信直後の楽観反映: 読み込み済みの Daily グループに行を差し込む
function insertDailyItem(date, item, position) {
  const group = dailyGroups.find((g) => g.date === date);
  if (group) {
    group.items = position === "top" ? [item, ...group.items] : [...group.items, item];
  } else {
    const newGroup = { date, items: [item], hasMore: false };
    const at = dailyGroups.findIndex((g) => g.date < date);
    if (at >= 0) dailyGroups.splice(at, 0, newGroup);
    else if (!dailyHasMore) dailyGroups.push(newGroup);
    // else: 未読み込みの過去領域なので差し込まない（再取得時に現れる）
  }
  saveDailyCache();
}

function afterComposeSend(dest, { id, name, note, todo, due }) {
  const now = Math.floor(Date.now() / 1000);
  const position = normalizePosition(settings.composePosition);
  const item = {
    id: id || `temp-${Date.now()}`,
    name,
    plainName: name,
    note: note || null,
    todo,
    completed: false,
    due: due || null,
    createdAt: now,
  };
  const target = destSendTarget(dest, settings.places);
  if (!target) return;

  if (target.targetType === "calendar") {
    insertDailyItem(target.day, item, position);
  } else if (dest.kind === "place" && nodeViews[dest.placeId]) {
    const items = nodeViews[dest.placeId].items;
    nodeViews[dest.placeId] = {
      ...nodeViews[dest.placeId],
      items: position === "top" ? [item, ...items] : [...items, item],
    };
    saveNodeViewsCache();
  }

  if (todo) {
    const parentName =
      dest.kind === "daily"
        ? "Daily"
        : dest.kind === "place"
          ? settings.places.find((p) => p.id === dest.placeId)?.name
          : dest.name;
    tasksState = [
      {
        id: item.id,
        name,
        plainName: name,
        note: item.note,
        parentId: target.parentId || null,
        parentPath: parentName ? [parentName] : [],
        createdAt: now,
        due: item.due,
        completed: false,
      },
      ...tasksState,
    ];
    setTasksCache(tasksState);
  }
  render();
}

async function handleAddTask() {
  const name = taskNameInput.value.trim();
  if (!name) {
    closeViaBack(); // 空のまま追加 = 連続追加の終了
    return;
  }
  const dest = composeDest;
  const target = destSendTarget(dest, settings.places);
  if (!target) {
    showToast("書き込み先を選択してください", true);
    return;
  }

  btnSaveTask.disabled = true;
  try {
    const result = await apiRequest("/send", {
      method: "POST",
      body: JSON.stringify({
        ...target,
        name,
        position: normalizePosition(settings.composePosition),
        layoutMode: "todo",
      }),
    });

    const due = resolveAddDue();
    if (due && result.item_id) {
      await apiRequest(`/nodes/${encodeURIComponent(result.item_id)}/schedule`, {
        method: "POST",
        body: JSON.stringify({ date: due.date, time: due.time || undefined }),
      });
    }

    afterComposeSend(dest, { id: result.item_id, name, note: null, todo: true, due });
    showToast("追加しました");
    if (afterSendAction(composeContinuous) === "continue") {
      // 連続追加 ON: シートは開いたままにし、入力だけ初期化して次の1件を待つ
      resetComposeInputs();
      taskNameInput.focus();
    } else {
      closeViaBack();
    }
  } catch (e) {
    showToast(e.message, true);
  } finally {
    btnSaveTask.disabled = false;
  }
}

async function handleSendNote() {
  const draft = splitNoteDraft(noteInput.value);
  if (!draft) {
    closeViaBack(); // 空のまま追加 = 連続追加の終了
    return;
  }
  const dest = composeDest;
  const target = destSendTarget(dest, settings.places);
  if (!target) {
    showToast("書き込み先を選択してください", true);
    return;
  }

  btnSaveNote.disabled = true;
  try {
    const result = await apiRequest("/send", {
      method: "POST",
      body: JSON.stringify({
        ...target,
        name: draft.name,
        note: draft.note || undefined,
        position: normalizePosition(settings.composePosition),
      }),
    });
    afterComposeSend(dest, { id: result.item_id, name: draft.name, note: draft.note, todo: false, due: null });
    // ノートを Daily に書いたときは背後を Daily ビューへ移動してその行を見せる
    if (dest.kind === "daily" && view !== "daily") switchView("daily");
    showToast("追加しました");
    if (afterSendAction(composeContinuous) === "continue") {
      // 連続追加 ON: シートは開いたままにし、入力だけ初期化して次の1件を待つ
      resetComposeInputs();
      noteInput.focus();
    } else {
      closeViaBack();
    }
  } catch (e) {
    showToast(e.message, true);
  } finally {
    btnSaveNote.disabled = false;
  }
}

// ==================== Event binding ====================

function bindEvents() {
  tabbar.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      selectedNodeKey = null;
      subtreeStack = [];
      render();
      syncHistoryArm(); // ドリルダウンをタブ切り替えで抜けたら番兵を回収
    });
  });

  btnBack.addEventListener("click", closeViaBack);

  btnSettings.addEventListener("click", openSettings);
  btnCloseSettings.addEventListener("click", closeViaBack);

  btnAddTask.addEventListener("click", openAddSheet);

  document.querySelectorAll("[data-close-sheet]").forEach((el) => {
    el.addEventListener("click", closeViaBack);
  });

  sheetAddEl.querySelectorAll(".due-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      addDue = chip.dataset.due;
      taskDateInput.value = "";
      taskTimeInput.value = "";
      renderDueChips();
    });
  });

  taskDateInput.addEventListener("input", renderDueChips);
  taskTimeInput.addEventListener("input", renderDueChips);

  for (const btn of [btnContinuousTask, btnContinuousNote]) {
    btn.addEventListener("click", () => {
      composeContinuous = !composeContinuous;
      renderCompose();
    });
  }

  // 挿入位置トグル（▼ 末尾 / ▲ 先頭）。設定として永続化する
  for (const btn of [btnPosTask, btnPosNote]) {
    btn.addEventListener("click", () => {
      settings.composePosition = togglePosition(settings.composePosition);
      saveSettings();
      renderCompose();
    });
  }

  btnSaveTask.addEventListener("click", handleAddTask);
  taskNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTask();
    }
  });

  // compose: モード切り替え / 送信先セレクタ / ノート送信
  composeModebar.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      composeMode = btn.dataset.mode;
      settings.composeMode = composeMode; // 次回もこのモードで開く
      saveSettings();
      renderCompose();
      (composeMode === "task" ? taskNameInput : noteInput).focus();
    });
  });
  btnComposeDest.addEventListener("click", openPicker);
  btnComposeDestSmall.addEventListener("click", openPicker);
  btnPickerDone.addEventListener("click", closePicker);
  btnSaveNote.addEventListener("click", handleSendNote);

  pickerDailyChips.querySelectorAll(".picker-day").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.day;
      const todayStr = localDateString();
      if (key === "custom") {
        pickerCustomDay = true;
        composeDest = { kind: "daily", day: pickerDateInput.value || todayStr };
      } else {
        pickerCustomDay = false;
        const day =
          key === "today" ? null : key === "tomorrow" ? addDays(todayStr, 1) : nextMonday(todayStr);
        composeDest = { kind: "daily", day };
      }
      renderPicker();
    });
  });
  pickerDateInput.addEventListener("input", () => {
    if (pickerDateInput.value) {
      composeDest = { kind: "daily", day: pickerDateInput.value };
      renderPicker();
    }
  });


  btnSnoozeTomorrow.addEventListener("click", () => snoozeSheetTask("tomorrow"));

  sheetTaskDue.addEventListener("click", toggleDueEditor);
  btnSheetLayout.addEventListener("click", toggleSheetLayout);
  btnSheetShare.addEventListener("click", openShareSheet);
  btnShareUrl.addEventListener("click", shareSheetTaskAsUrl);
  btnShareText.addEventListener("click", shareSheetTaskAsText);

  // タイトル・メモはクリックでその場編集。メモ面はタスク（定義リストの「メモ」行）と
  // メモ（note の読み物面）で要素が分かれるので、同じ保存処理を両方に結ぶ。
  const noteValue = () => (sheetTask && sheetTask.note ? stripHtml(sheetTask.note) : "");
  bindInlineEdit(sheetTaskTitle, {
    multiline: false,
    placeholder: "タイトル",
    currentValue: () => normalizeTitle(sheetTask.plainName),
    save: saveSheetTitle,
  });
  [sheetTaskNote, sheetItemNote].forEach((el) => {
    bindInlineEdit(el, {
      multiline: true,
      placeholder: "メモ",
      currentValue: noteValue,
      save: saveSheetNote,
    });
  });

  sheetTaskEl.querySelectorAll(".sheet-due-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const due = dueShortcut(chip.dataset.due);
      applySheetDue(due ? due.date : null);
    });
  });

  btnSheetSetDue.addEventListener("click", () => {
    const date = sheetDateInput.value;
    const time = sheetTimeInput.value;
    if (!date && !time) {
      showToast("日付を選択してください", true);
      return;
    }
    applySheetDue(date || localDateString(), time || undefined);
  });

  btnConfirmDelete.addEventListener("click", confirmDelete);
  btnCancelDelete.addEventListener("click", closeViaBack);

  btnSheetComplete.addEventListener("click", () => {
    if (!sheetTask) return;
    const row = findRow(sheetTask.id);
    if (sheetOrigin === "tasks") toggleComplete(sheetTask, row);
    else toggleItemComplete(sheetTask, row, sheetOrigin);
    closeViaBack();
  });

  btnSheetDelete.addEventListener("click", () => {
    if (!sheetTask) return;
    const entity = sheetTask;
    const origin = sheetOrigin;
    if (sheetDate) {
      const date = sheetDate;
      const dateWrap = taskList.querySelector(`[data-date="${CSS.escape(date)}"]`);
      sheetTaskEl.classList.add("hidden");
      openDeleteConfirm(
        dailyNoteTitle(date),
        () => deleteDailyNote(date, dateWrap, dateWrap ? dateWrap.querySelector(".date-header-row") : null),
        DELETE_NOTE_DAY
      );
      return;
    }
    const wrap = taskList.querySelector(`[data-task-id="${CSS.escape(entity.id)}"]`);
    const row = wrap ? wrap.querySelector(".task-row") : null;
    sheetTaskEl.classList.add("hidden");
    openDeleteConfirm(normalizeTitle(entity.plainName) || "（無題）", () => {
      if (origin === "tasks") deleteTask(entity, wrap, row);
      else deleteItem(entity, wrap, row, origin);
    });
  });

  bindViewBarSwipe();
  bindViewbarEdit();

  // 無限スクロール（下端付近で自動読み込み）: Daily の過去分と
  // Deadlines 完了グループの続き
  taskList.addEventListener("scroll", () => {
    const nearBottom = taskList.scrollTop + taskList.clientHeight >= taskList.scrollHeight - 200;
    if (!nearBottom) return;
    if (view === "daily" && dailyHasMore && !dailyLoading) loadDailyMore();
    else if (dueDoneHasMore) loadMoreCompletedDue();
  });

  // Re-fetch when the app returns to the foreground, so edits made in
  // Workflowy itself show up (60s cache still applies).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadCurrentView();
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
  const entity = sheetTask;
  const origin = sheetOrigin;
  closeViaBack();
  try {
    await scheduleEntity(entity, due.date, undefined, origin);
    showToast(option === "tomorrow" ? "明日に設定しました" : "来週に設定しました");
  } catch (e) {
    showToast(e.message, true);
  }
}

// ==================== Settings ====================

function openSettings() {
  settingsDate.textContent = formatHeaderDate();
  updateApiKeyUI();
  renderPlaceList();
  refreshNotificationUI();
  renderSyncLabel();
  screenSettings.classList.remove("hidden");
  armHistory();
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

  btnSyncNow.addEventListener("click", () => {
    loadTasks(true);
    if (view !== "tasks") loadCurrentView(true);
  });

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
    settingsTreeRefPath = "";
    destNameInput.value = "";
    settingsNodeTree.reset();
  });

  btnSaveDestination.addEventListener("click", savePlace);
  btnCancelDestination.addEventListener("click", () => panelAddDest.classList.add("hidden"));
}

function renderSyncLabel() {
  syncLabel.textContent = formatSyncAgo(Date.now(), lastSyncMs);
}

// ==================== Settings 場所カード ====================

const ICON_GRIP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`;
const ICON_EYE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EYE_OFF = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

function renderPlaceList() {
  placeCount.textContent = String(settings.places.length);
  placeList.innerHTML = "";

  for (const place of settings.places) {
    const builtin = place.kind !== "node";
    const row = document.createElement("div");
    row.className = "place-row";
    row.dataset.placeId = place.id;
    row.innerHTML =
      `<button class="place-grip" title="並べ替え（⌥↑ / ⌥↓）">${ICON_GRIP}</button>` +
      '<div class="place-info">' +
      '<div class="place-name"><span class="place-name-text"></span>' +
      (builtin ? '<span class="place-badge">組み込み</span>' : "") +
      "</div>" +
      '<div class="place-ref hidden"></div>' +
      "</div>" +
      '<button class="place-eye" title="ビューへの表示を切り替え"></button>' +
      (builtin ? "" : `<button class="place-delete" title="削除">${ICON_TRASH}</button>`);

    row.querySelector(".place-name-text").textContent = place.name;
    if (place.refPath) {
      const ref = row.querySelector(".place-ref");
      ref.textContent = place.refPath;
      ref.classList.remove("hidden");
    }

    const eye = row.querySelector(".place-eye");
    eye.innerHTML = place.inView ? ICON_EYE : ICON_EYE_OFF;
    eye.classList.toggle("off", !place.inView);
    eye.addEventListener("click", () => togglePlaceView(place.id));

    const del = row.querySelector(".place-delete");
    if (del) del.addEventListener("click", () => deletePlace(place.id));

    bindPlaceReorder(row);
    placeList.appendChild(row);
  }
}

function togglePlaceView(id) {
  const next = toggleInView(settings.places, id);
  if (!next) {
    showToast("最後のビューは非表示にできません", true);
    return;
  }
  settings.places = next;
  saveSettings();
  renderPlaceList();
  // 表示中のビューを OFF にした場合は先頭の表示中ビューへ自動的に移動する
  const ensured = ensureVisibleView(settings.places, view);
  if (ensured !== view) switchView(ensured);
  else render();
}

function deletePlace(id) {
  const place = settings.places.find((p) => p.id === id);
  if (!place || place.kind !== "node") return; // 組み込みの Tasks / Daily は削除不可
  settings.places = settings.places.filter((p) => p.id !== id);
  saveSettings();
  saveNodeViewsCache(); // 削除した場所のビューキャッシュを落とす
  renderPlaceList();
  const ensured = ensureVisibleView(settings.places, view);
  if (ensured !== view) switchView(ensured);
  else render();
  showToast("場所を削除しました");
}

// ドラッグ&ドロップで並べ替え（確定時にのみ保存）。キーボードは ⌥↑ / ⌥↓。
function bindPlaceReorder(row) {
  const grip = row.querySelector(".place-grip");

  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {}
    row.classList.add("dragging");
    placeList.classList.add("reordering");

    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      for (const other of placeList.querySelectorAll(".place-row")) {
        if (other === row) continue;
        const rect = other.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const rowIsAfter = !!(other.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (ev.clientY < mid && rowIsAfter) {
          placeList.insertBefore(row, other);
          break;
        }
        if (ev.clientY > mid && !rowIsAfter) {
          placeList.insertBefore(row, other.nextSibling);
          break;
        }
      }
    };

    const finish = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", finish);
      grip.removeEventListener("pointercancel", finish);
      row.classList.remove("dragging");
      placeList.classList.remove("reordering");
      const ids = [...placeList.querySelectorAll(".place-row")].map((el) => el.dataset.placeId);
      settings.places = reorderPlaces(settings.places, ids);
      saveSettings();
      render(); // ビューバーの並びに即反映
    };

    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", finish);
    grip.addEventListener("pointercancel", finish);
  });

  grip.addEventListener("keydown", (e) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const id = row.dataset.placeId;
    settings.places = movePlace(settings.places, id, e.key === "ArrowUp" ? -1 : 1);
    saveSettings();
    renderPlaceList();
    render();
    placeList.querySelector(`[data-place-id="${CSS.escape(id)}"] .place-grip`)?.focus();
  });
}

let settingsTreeRefPath = "";

function savePlace() {
  if (!selectedTreeNodeId) {
    showToast("ノードを選択してください", true);
    return;
  }
  const name = destNameInput.value.trim();
  if (!name) {
    showToast("表示名を入力してください", true);
    return;
  }

  settings.places = [
    ...settings.places,
    {
      id: crypto.randomUUID(),
      kind: "node",
      name,
      ref: selectedTreeNodeId,
      refPath: settingsTreeRefPath || undefined,
      inView: true,
    },
  ];
  saveSettings();
  renderPlaceList();
  render();
  panelAddDest.classList.add("hidden");
  showToast("場所を追加しました");
}

// ==================== Node tree picker ====================

// 階層をたどってノードを 1 つ選ぶピッカー。設定の「場所を追加」と compose の
// 送信先セレクタで使う（それぞれ独立した状態を持つ）。
function createNodeTreePicker(container, { onSelect }) {
  let path = []; // [{ id, name }] breadcrumb trail
  let selectedId = null;

  async function load(parentId) {
    container.innerHTML = '<div class="tree-empty"><div class="spinner"></div></div>';
    try {
      const pid = parentId || "None";
      const nodes = await apiRequest(`/nodes?parent_id=${encodeURIComponent(pid)}`);
      renderTree(nodes);
    } catch (e) {
      container.innerHTML = `<p class="tree-empty">${escapeText(e.message)}</p>`;
    }
  }

  function select(id, name) {
    selectedId = id;
    onSelect(id ? { id, name } : null);
  }

  function renderTree(nodes) {
    container.innerHTML = "";

    // Breadcrumb navigation
    if (path.length > 0) {
      const breadcrumb = document.createElement("div");
      breadcrumb.className = "node-tree-breadcrumb";

      const rootLink = document.createElement("span");
      rootLink.className = "breadcrumb-link";
      rootLink.textContent = "Home";
      rootLink.addEventListener("click", () => {
        path = [];
        select(null, "");
        load();
      });
      breadcrumb.appendChild(rootLink);

      for (let i = 0; i < path.length; i++) {
        const sep = document.createElement("span");
        sep.className = "breadcrumb-sep";
        sep.textContent = " / ";
        breadcrumb.appendChild(sep);

        const crumb = path[i];
        if (i < path.length - 1) {
          const link = document.createElement("span");
          link.className = "breadcrumb-link";
          link.textContent = crumb.name;
          link.addEventListener("click", () => {
            path = path.slice(0, i + 1);
            select(crumb.id, crumb.name);
            load(crumb.id);
          });
          breadcrumb.appendChild(link);
        } else {
          const current = document.createElement("span");
          current.className = "breadcrumb-current";
          current.textContent = crumb.name;
          breadcrumb.appendChild(current);
        }
      }

      container.appendChild(breadcrumb);
    }

    if (!nodes.length) {
      const msg = document.createElement("p");
      msg.className = "tree-empty";
      msg.textContent = "子ノードがありません";
      container.appendChild(msg);
      return;
    }

    for (const node of nodes) {
      const text = normalizeTitle(node.name) || "(無題)";
      const div = document.createElement("div");
      const isCompleted = node.completedAt !== null;
      div.className =
        "node-tree-item" +
        (selectedId === node.id ? " selected" : "") +
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
        select(node.id, text);
        container.querySelectorAll(".node-tree-item").forEach((el) => el.classList.remove("selected"));
        div.classList.add("selected");
      });

      // Click drill button to navigate into children
      drillBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        select(node.id, text);
        path.push({ id: node.id, name: text });
        load(node.id);
      });

      container.appendChild(div);
    }
  }

  function reset() {
    path = [];
    selectedId = null;
    return load();
  }

  return {
    load,
    reset,
    get selectedId() {
      return selectedId;
    },
    get pathNames() {
      return path.map((c) => c.name);
    },
  };
}

// 設定「場所を追加」用: 選択で表示名の初期値と参照先パスも埋める
const settingsNodeTree = createNodeTreePicker(nodeTree, {
  onSelect: (sel) => {
    selectedTreeNodeId = sel ? sel.id : null;
    destNameInput.value = sel ? sel.name : "";
    if (sel) {
      const names = settingsNodeTree.pathNames;
      const full = names[names.length - 1] === sel.name ? names : [...names, sel.name];
      settingsTreeRefPath = full.join(" / ");
    } else {
      settingsTreeRefPath = "";
    }
  },
});

// compose 送信先セレクタ用
const composeNodeTree = createNodeTreePicker(pickerNodeTree, {
  onSelect: (sel) => {
    if (sel) {
      composeDest = { kind: "node", nodeId: sel.id, name: sel.name };
      pickerCustomDay = false;
      renderPicker();
    }
  },
});

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
