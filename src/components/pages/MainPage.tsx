import type { FC } from "hono/jsx";

// Lucide "settings" gear (stroke-width 1.5), inlined per the design handoff.
const GearIcon: FC = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

export const MainPage: FC = () => (
  <div id="app">
    <div id="toast" class="toast hidden"></div>

    <div class="statusbar">
      <span id="header-date"></span>
    </div>

    <header class="header">
      <div class="header-text">
        <button id="btn-back" class="header-back hidden">‹ Nodes</button>
        <h1 id="screen-title">Today</h1>
        <div id="screen-count" class="screen-count"></div>
      </div>
      <button id="btn-settings" class="btn-gear" title="設定">
        <GearIcon />
      </button>
    </header>

    <div class="tabbar" id="tabbar" role="tablist">
      <button class="tab" data-tab="today" role="tab">Today</button>
      <button class="tab" data-tab="due" role="tab">Deadlines</button>
      <button class="tab" data-tab="nodes" role="tab">Nodes</button>
    </div>

    <main id="task-list" class="task-list"></main>

    {/* 下部ビューバー（全画面共通）。切り替え操作はこのバーの中だけで完結する */}
    <nav id="viewbar" class="viewbar" aria-label="ビュー切り替え">
      <div id="viewbar-track" class="viewbar-track" role="tablist"></div>
    </nav>

    <button id="btn-add-task" class="fab" title="新しく書き留める">+</button>

    {/* 詳細シート（行タップ） */}
    <div id="sheet-task" class="sheet hidden">
      <div class="sheet-backdrop" data-close-sheet="sheet-task"></div>
      <div class="sheet-panel">
        <div class="sheet-grabber"></div>
        {/* メモのみ: 時刻 · 場所 */}
        <div id="sheet-item-meta" class="sheet-item-meta hidden"></div>
        <div id="sheet-task-title" class="sheet-title"></div>
        <div id="sheet-task-props" class="sheet-props">
          <span class="sheet-prop-label">期限</span>
          <button id="sheet-task-due" class="sheet-prop-value sheet-prop-edit sheet-due" title="期限を変更"></button>
          <span class="sheet-prop-label">ノード</span>
          <span id="sheet-task-node" class="sheet-prop-value"></span>
          <span class="sheet-prop-label">メモ</span>
          <button id="sheet-task-note" class="sheet-prop-value sheet-prop-edit sheet-note" title="メモを編集"></button>
        </div>

        {/* 期限エディタ（期限行タップで開閉） */}
        <div id="sheet-due-editor" class="sheet-editor hidden">
          <div class="sheet-chip-row">
            <button class="chip sheet-due-chip" data-due="today">今日</button>
            <button class="chip sheet-due-chip" data-due="tomorrow">明日</button>
            <button class="chip sheet-due-chip" data-due="week">来週</button>
            <button class="chip sheet-due-chip" data-due="none">期限なし</button>
          </div>
          <div class="sheet-custom-row">
            <input id="sheet-date-input" type="date" class="sheet-input-small" />
            <input id="sheet-time-input" type="time" class="sheet-input-small" />
            <button id="btn-sheet-set-due" class="chip-submit">設定</button>
          </div>
        </div>

        {/* メモエディタ（メモ行タップで開閉） */}
        <div id="sheet-note-editor" class="sheet-editor hidden">
          <textarea id="sheet-note-input" class="sheet-textarea" rows={3} placeholder="メモ"></textarea>
          <div class="sheet-custom-row">
            <button id="btn-sheet-cancel-note" class="btn-outline">キャンセル</button>
            <button id="btn-sheet-save-note" class="chip-submit">保存</button>
          </div>
        </div>
        {/* メモのみ: note を読むための面 */}
        <div id="sheet-item-note" class="sheet-note-face hidden"></div>
        <a id="sheet-task-link" class="sheet-link" href="https://workflowy.com/" target="_blank" rel="noreferrer noopener">
          <span>Workflowy で開く</span>
          <span class="sheet-link-arrow">↗</span>
        </a>
        <div class="sheet-actions">
          <button id="btn-sheet-delete" class="sheet-action sheet-action-delete" title="削除">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button id="btn-snooze-tomorrow" class="sheet-action">明日へ</button>
          <button id="btn-sheet-complete" class="sheet-action primary">完了にする</button>
        </div>
      </div>
    </div>

    {/* 削除確認シート（左スワイプ） */}
    <div id="sheet-delete" class="sheet hidden">
      <div class="sheet-backdrop" data-close-sheet="sheet-delete"></div>
      <div class="sheet-panel">
        <div class="sheet-grabber"></div>
        <div class="sheet-title">削除しますか</div>
        <div id="sheet-delete-title" class="sheet-delete-target"></div>
        <p class="sheet-delete-note">Workflowy 側のノードも削除されます。元に戻せません。</p>
        <div class="sheet-actions">
          <button id="btn-cancel-delete" class="sheet-action">キャンセル</button>
          <button id="btn-confirm-delete" class="sheet-action danger">削除</button>
        </div>
      </div>
    </div>

    {/* 追加シート（FAB） */}
    <div id="sheet-add" class="sheet hidden">
      <div class="sheet-backdrop" data-close-sheet="sheet-add"></div>
      <div class="sheet-panel sheet-panel-add">
        <input id="task-name-input" type="text" class="sheet-input" placeholder="新しいタスク" autocomplete="off" />
        <div class="sheet-chip-row">
          <button class="chip due-chip" data-due="today">今日</button>
          <button class="chip due-chip" data-due="tomorrow">明日</button>
          <button class="chip due-chip" data-due="week">来週</button>
          <button class="chip due-chip" data-due="none">期限なし</button>
        </div>
        <div class="sheet-custom-row">
          <input id="task-date-input" type="date" class="sheet-input-small" />
          <input id="task-time-input" type="time" class="sheet-input-small" />
          <button id="btn-save-task" class="chip-submit">追加</button>
        </div>
      </div>
    </div>

    {/* 設定（全画面） */}
    <div id="screen-settings" class="settings hidden">
      <div class="statusbar">
        <span id="settings-date"></span>
      </div>
      <div class="header">
        <h1>設定</h1>
        <button id="btn-close-settings" class="btn-close" title="閉じる">✕</button>
      </div>

      <div class="settings-cards">
        <section class="card">
          <div class="card-title">アカウント</div>
          <div id="apikey-view" class="card-row">
            <div class="apikey-masked">••••••••</div>
            <button id="btn-edit-apikey" class="btn-outline">変更</button>
          </div>
          <div id="apikey-edit" class="card-row hidden">
            <input id="api-key-input" type="password" class="settings-input" placeholder="Workflowy API Key" />
            <button id="btn-save-apikey" class="btn-outline">保存</button>
          </div>
          <p class="card-note">
            API キーとデータはこのサーバーで処理されます。
            <a href="https://workflowy.com/api-key" target="_blank" rel="noopener">API キーを取得</a>
            <span> ／ </span>
            <button id="btn-clear-apikey" class="link-button hidden">クリア</button>
          </p>
        </section>

        <section class="card">
          <div class="card-row space-between">
            <div class="card-title">通知</div>
            <button id="btn-toggle-notifications" class="pill">有効にする</button>
          </div>
          <p class="card-desc">時刻つきのタスクはその時刻に、日付だけのタスクは下のリマインド時刻にまとめて通知します。</p>
          <p id="notification-status" class="card-note hidden"></p>
          <div id="reminder-hours" class="chip-row"></div>
          <button id="btn-test-notification" class="link-button hidden">テスト通知を送る</button>
        </section>

        <section class="card">
          <div class="card-title">同期</div>
          <div class="card-row space-between">
            <span id="sync-label" class="card-desc-inline">未同期</span>
            <button id="btn-sync-now" class="btn-outline">今すぐ同期</button>
          </div>
        </section>

        <section class="card">
          <div class="card-title">保存先</div>
          <div id="destination-list" class="destination-list"></div>
          <button id="btn-add-destination" class="btn-dashed">＋ 保存先を追加</button>

          <div id="panel-add-destination" class="dest-panel hidden">
            <div class="radio-group" id="dest-type-group">
              <label>
                <input type="radio" name="dest-type" value="node" checked />
                ノード
              </label>
              <label>
                <input type="radio" name="dest-type" value="calendar" />
                カレンダー（Daily Note）
              </label>
            </div>
            <div id="node-tree" class="node-tree">
              <p class="tree-empty">読み込み中...</p>
            </div>
            <div class="input-group">
              <input id="dest-name-input" type="text" class="settings-input" placeholder="表示名" />
            </div>
            <div class="card-row">
              <button id="btn-save-destination" class="btn-fill">保存</button>
              <button id="btn-cancel-destination" class="btn-outline">キャンセル</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
);
