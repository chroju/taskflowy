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
        {/* クリックでその場編集（contenteditable。client.js の bindInlineEdit） */}
        <div id="sheet-task-title" class="sheet-title" title="タイトルを編集"></div>

        <div id="sheet-task-props" class="sheet-props">
          <span class="sheet-prop-label">期限</span>
          <button id="sheet-task-due" class="sheet-prop-value sheet-prop-edit sheet-due" title="期限を変更"></button>
          <span class="sheet-prop-label">ノード</span>
          <span id="sheet-task-node" class="sheet-prop-value"></span>
          <span class="sheet-prop-label">メモ</span>
          <div id="sheet-task-note" class="sheet-prop-value sheet-prop-edit sheet-note" title="メモを編集"></div>
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

        {/* メモのみ: note の面。こちらもクリックでその場編集できる */}
        <div id="sheet-item-note" class="sheet-note-face hidden" title="メモを編集"></div>
        <a id="sheet-task-link" class="sheet-link" href="https://workflowy.com/" target="_blank" rel="noreferrer noopener">
          <span>Workflowy で開く</span>
          <span class="sheet-link-arrow">↗</span>
        </a>
        <div id="sheet-actions" class="sheet-actions">
          <button id="btn-sheet-delete" class="sheet-action sheet-action-delete" title="削除">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button id="btn-sheet-layout" class="sheet-action">メモにする</button>
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
        <p id="sheet-delete-note" class="sheet-delete-note">Workflowy 側のノードも削除されます。元に戻せません。</p>
        <div class="sheet-actions">
          <button id="btn-cancel-delete" class="sheet-action">キャンセル</button>
          <button id="btn-confirm-delete" class="sheet-action danger">削除</button>
        </div>
      </div>
    </div>

    {/* compose シート（FAB）。タスク / ノートの 2 モード + 送信先セレクタ */}
    <div id="sheet-add" class="sheet hidden">
      <div class="sheet-backdrop" data-close-sheet="sheet-add"></div>
      <div class="sheet-panel sheet-panel-add">
        <div class="sheet-grabber"></div>

        {/* 本体 */}
        <div id="compose-main">
          <div class="compose-modebar" id="compose-modebar">
            <button class="tab" data-mode="task">タスク</button>
            <button class="tab" data-mode="note">ノート</button>
          </div>

          {/* 書き込み先（タスクモードのみここに出す。ノートモードは下端ツールバーに畳む） */}
          <div id="compose-dest-row" class="compose-dest-row">
            <span class="compose-dest-label">書き込み先</span>
            <button id="btn-compose-dest" class="compose-dest-btn">
              <span id="compose-dest-icon" class="compose-dest-icon"></span>
              <span id="compose-dest-name" class="compose-dest-name"></span>
              <span class="compose-dest-chevron">▾</span>
            </button>
            <button id="btn-pos-task" class="chip compose-pos" title="挿入位置"></button>
          </div>

          {/* タスクモード */}
          <div id="compose-task-body">
            <input id="task-name-input" type="text" class="sheet-input" placeholder="新しいタスク" autocomplete="off" />
            <div class="sheet-chip-row">
              <span class="compose-due-label">期限</span>
              <button class="chip due-chip" data-due="today">今日</button>
              <button class="chip due-chip" data-due="tomorrow">明日</button>
              <button class="chip due-chip" data-due="week">来週</button>
              <button class="chip due-chip" data-due="none">期限なし</button>
            </div>
            <div class="sheet-custom-row">
              <input id="task-date-input" type="date" class="sheet-input-small" />
              <input id="task-time-input" type="time" class="sheet-input-small" />
            </div>
            <div class="compose-footer">
              <span class="compose-footer-note">書き込み先の日付と、タスクの期限は別ものです。</span>
              <button id="btn-continuous-task" class="chip compose-continuous">連続</button>
              <button id="btn-save-task" class="compose-submit">追加</button>
            </div>
          </div>

          {/* ノートモード: 書くことに専念させる枠のないテキストエリア */}
          <div id="compose-note-body" class="hidden">
            <textarea id="note-input" class="compose-textarea" placeholder="書き留める…"></textarea>
            <div class="compose-note-toolbar">
              <button id="btn-compose-dest-small" class="compose-dest-small">
                <span id="compose-dest-small-icon" class="compose-dest-icon small"></span>
                <span id="compose-dest-small-name" class="compose-dest-name"></span>
              </button>
              <button id="btn-pos-note" class="chip compose-pos" title="挿入位置"></button>
              <button id="btn-continuous-note" class="chip compose-continuous">連続</button>
              <button id="btn-save-note" class="compose-submit">追加</button>
            </div>
          </div>
        </div>

        {/* 送信先セレクタ（シート内で本体と入れ替わる） */}
        <div id="compose-picker" class="hidden">
          <div class="compose-picker-header">
            <span>書き込み先</span>
            <button id="btn-picker-done" class="picker-done">完了</button>
          </div>
          <div class="compose-picker-scroll">
            <div class="picker-section-label">Daily</div>
            <div class="sheet-chip-row" id="picker-daily-chips">
              <button class="chip picker-day" data-day="today">今日</button>
              <button class="chip picker-day" data-day="tomorrow">明日</button>
              <button class="chip picker-day" data-day="week">来週</button>
              <button class="chip picker-day" data-day="custom">日付…</button>
            </div>
            <input id="picker-date-input" type="date" class="sheet-input-small picker-date hidden" />
            <div class="picker-section-label">登録済みの場所</div>
            <div id="picker-places" class="picker-places"></div>
            <div class="picker-section-label">ノードを選ぶ</div>
            <div id="picker-node-tree" class="node-tree">
              <p class="tree-empty">読み込み中...</p>
            </div>
          </div>
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
          <p class="card-desc">時刻つきのタスクはその時刻に通知します。日付だけのタスクと期限切れのタスクは、下のリマインド時刻にまとめて通知します。</p>
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
          <div class="card-row space-between">
            <div class="card-title">場所</div>
            <span id="place-count" class="place-count"></span>
          </div>
          <p class="card-desc">書き込み先とビューの並び順を管理します。眼のアイコンでビューへの表示を切り替えます。</p>
          <div id="place-list" class="place-list"></div>
          <button id="btn-add-destination" class="btn-dashed">＋ 場所を追加</button>

          <div id="panel-add-destination" class="dest-panel hidden">
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
