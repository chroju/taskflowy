import type { FC } from "hono/jsx";

export const MainPage: FC = () => (
  <div id="app">
    <div id="toast" class="toast hidden"></div>

    <div id="view-tasks" class="view">
      <main class="main">
        <div class="tasks-toolbar">
          <div id="task-group-tabs" class="segmented" role="tablist">
            <button class="segmented-item" data-group="due" role="tab">Due</button>
            <button class="segmented-item" data-group="parent" role="tab">Parent</button>
            <button class="segmented-item" data-group="created" role="tab">Created</button>
          </div>
          <button id="btn-refresh-tasks" class="btn-refresh-tasks" title="Refresh">
            <iconify-icon icon="heroicons:arrow-path" width="18" height="18"></iconify-icon>
          </button>
          <button id="btn-settings" class="btn" title="Settings">
            <iconify-icon icon="heroicons:cog-6-tooth" width="22" height="22"></iconify-icon>
          </button>
        </div>
        <div id="task-list" class="task-list">
          <p class="text-muted">Loading...</p>
        </div>
      </main>

      {/* Add task FAB */}
      <button id="btn-add-task" class="btn-compose-fab" title="New task">
        <iconify-icon icon="heroicons:plus" width="26" height="26"></iconify-icon>
      </button>
    </div>

    {/* Undo toast for task completion */}
    <div id="undo-toast" class="undo-toast hidden">
      <span id="undo-toast-message">Task completed</span>
      <button id="btn-undo" class="undo-toast-action">Undo</button>
    </div>

    {/* Settings Modal */}
    <div id="modal-settings" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>Settings</h2>
          <button class="modal-close" data-close-modal="modal-settings">&times;</button>
        </div>
        <div class="modal-body">
          <details class="settings-section">
            <summary class="settings-summary"><h3>API Key</h3></summary>
            <div class="settings-content">
              <div class="input-group">
                <input id="api-key-input" type="password" placeholder="Workflowy API Key" class="input" />
                <button id="btn-save-apikey" class="btn btn-small btn-primary">Save</button>
                <button id="btn-clear-apikey" class="btn btn-small hidden">Clear</button>
                <button id="btn-edit-apikey" class="btn btn-small hidden">Edit</button>
              </div>
              <p class="text-muted text-small">
                <a href="https://workflowy.com/api-key" target="_blank" rel="noopener">Get your API key</a>
              </p>
              <p class="text-muted text-small">
                WARN: Your API key and data are processed by this server. <a href="https://github.com/chroju/taskflowy" target="_blank" rel="noopener">Deploy your own</a> for full privacy.
              </p>
            </div>
          </details>

          <details class="settings-section">
            <summary class="settings-summary"><h3>Notifications</h3></summary>
            <div class="settings-content">
              <p id="notification-status" class="text-muted text-small">Checking status…</p>
              <div class="btn-group">
                <button id="btn-enable-notifications" class="btn btn-small btn-primary">Enable</button>
                <button id="btn-disable-notifications" class="btn btn-small hidden">Disable</button>
                <button id="btn-test-notification" class="btn btn-small hidden">Send test</button>
              </div>
              <div class="input-group">
                <label class="input-label" for="notification-hour-input">Daily reminder time (JST)</label>
                <input id="notification-hour-input" type="number" min="0" max="23" class="input" />
                <button id="btn-save-notification-hour" class="btn btn-small">Save</button>
              </div>
              <p class="text-muted text-small">
                Tasks with a specific time notify when that time passes. Date-only tasks
                are bundled into one notification at the hour above (JST).
              </p>
            </div>
          </details>

          <details class="settings-section" open>
            <summary class="settings-summary"><h3>Destinations</h3></summary>
            <div class="settings-content">
              <div id="destination-list" class="destination-list"></div>
              <button id="btn-add-destination" class="btn btn-small">+ Add destination</button>

              {/* Add destination sub-panel */}
              <div id="panel-add-destination" class="sub-panel hidden">
                <h3>Add Destination</h3>
                <div class="checkbox-group" id="dest-type-group">
                  <label>
                    <input type="radio" name="dest-type" value="node" checked />
                    Node
                  </label>
                  <label>
                    <input type="radio" name="dest-type" value="calendar" />
                    Calendar (Daily Note)
                  </label>
                </div>
                <div id="node-tree" class="node-tree">
                  <p class="text-muted">Loading nodes...</p>
                </div>
                <div class="input-group">
                  <input id="dest-name-input" type="text" placeholder="Display name" class="input" />
                </div>
                <div class="btn-group">
                  <button id="btn-save-destination" class="btn btn-primary btn-small">Save</button>
                  <button id="btn-cancel-destination" class="btn btn-small">Cancel</button>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>

    {/* Add Task Modal */}
    <div id="modal-add-task" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>New task</h2>
          <button class="modal-close" data-close-modal="modal-add-task">&times;</button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <input id="task-name-input" type="text" placeholder="Task name" class="input" />
          </div>
          <div class="input-group">
            <button id="task-destination-selector" class="destination-selector" title="Change destination">
              <iconify-icon class="destination-icon" icon="heroicons:map-pin" width="15" height="15"></iconify-icon>
              <span id="task-destination-label">No destination</span>
              <iconify-icon class="destination-chevron" icon="heroicons:chevron-down" width="14" height="14"></iconify-icon>
            </button>
            <div id="task-destination-dropdown" class="destination-dropdown hidden"></div>
          </div>
          <button id="btn-save-task" class="btn btn-send">
            <iconify-icon icon="heroicons:paper-airplane" width="18" height="18"></iconify-icon>
            Add
          </button>
        </div>
      </div>
    </div>

    {/* Schedule Bottom Sheet */}
    <div id="modal-schedule" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>Schedule</h2>
          <button class="modal-close" data-close-modal="modal-schedule">&times;</button>
        </div>
        <div class="modal-body">
          <div class="schedule-shortcuts">
            <button class="btn schedule-shortcut" data-shortcut="today">Today</button>
            <button class="btn schedule-shortcut" data-shortcut="tomorrow">Tomorrow</button>
            <button class="btn schedule-shortcut" data-shortcut="nextMonday">Next Week</button>
          </div>
          <div class="input-group">
            <label class="input-label" for="schedule-date-input">Custom date</label>
            <input id="schedule-date-input" type="date" class="input" />
          </div>
          <div class="input-group">
            <label class="input-label" for="schedule-time-input">Time (optional)</label>
            <input id="schedule-time-input" type="time" class="input" />
          </div>
          <button id="btn-confirm-schedule" class="btn btn-primary btn-send">Set Due Date</button>
        </div>
      </div>
    </div>
  </div>
);
