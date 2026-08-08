# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TaskflowyはWorkflowy公式APIを利用したタスク管理＋メモ書き留めPWA。Cloudflare Workers上で
動作し、フロントエンドにHono JSXを使用。もとはJotflowy（ノートアプリ）のタスクビュー機能を
分離・再構成したプロジェクトで、その後Jotflowyのメモ書き留め機能を「ビュー統合」として
本アプリに吸収した。設計上の経緯は[DESIGN.md](./DESIGN.md)を参照。

## Commands

```bash
npm run dev        # 開発サーバー起動 (wrangler dev)
npm run deploy     # Cloudflare Workersへデプロイ
npm run typecheck  # TypeScript型チェック
npm test           # vitestでテスト実行（watchモード）
npm run test:run   # テストを1回実行
npm run test:ui    # vitest UI起動
```

## Testing Policy

- 新機能・バグ修正は必ずテストを先に書く（TDD）
- テストファイルは `src/test/` に配置し、対象モジュール名に合わせて命名（例: `crypto.test.ts`）
- 既存テストパターン（`describe` / `it` / `expect`、vitest）に倣う
- 外部依存（`fetch`、Web Crypto API、`WorkflowyClient`）は `vi.stubGlobal` / `vi.fn()` でモックする
- テスト実行: `npm run test:run`

## Architecture

### Backend (src/)
- `index.tsx` - Honoアプリケーションのエントリーポイント。ルーティング定義、`scheduled`ハンドラ（Cron）
- `api/handlers.ts` - APIエンドポイント実装。認証、タスク操作、送信先ノード一覧、Push購読/通知設定など
- `api/workflowy-v1.ts` - Workflowy API v1クライアント
- `api/crypto.ts` - APIキーの暗号化/復号化
- `api/tasks.ts` - `nodes-export`のフラットなノード配列からタスク（layoutMode=todo）を抽出。
  デフォルトは未完了のみ、`includeCompleted`オプションで完了済みも含める（`/api/tasks`が使用）
- `api/daily.ts` - Dailyビュー用。ネイティブカレンダーの日付キー（`YYYY-MM-DD`、404=その日なし）を
  遡ってプローブし、日付グループを収集する（`/api/daily`が使用）。`toViewItem`は
  Daily/登録ノードビュー共通のアイテム変換
- `api/time-markup.ts` - ノード名に埋め込む`<time>`マークアップのパース/生成
- `api/jst.ts` - JST（UTC+9固定）の日付/時刻ユーティリティ。Dateのロケール依存メソッドは使わない
- `api/notify.ts` - `selectDueNotifications`: 通知対象タスクを判定する純粋関数
- `api/push.ts` - Web Push送信（`@block65/webcrypto-web-push`）とVAPID鍵ペア生成
- `api/kv-store.ts` - KVアクセスの薄いラッパー（購読リスト、通知済み記録、通知設定、暗号化APIキー）
- `api/cron.ts` - `runNotificationSweep`: Cronから呼ばれる通知送信フローの本体
- `types/index.ts` - 共有型定義

### Frontend (public/)
- `scripts/client.js` - UIロジック（DOM操作、イベントバインド）。LocalStorageで設定保存、APIとの通信
- `scripts/tasks.js` - タスク一覧の純粋ロジック（Today/Deadlines/Nodesのグルーピング・タイトル正規化・
  日付フォーマット・スワイプ判定など）。DOM非依存でユニットテスト可能（`src/test/task-view.test.ts`）
- `scripts/views.js` - ビュー統合の純粋ロジック（場所リストの移行・並べ替え・表示切り替え、
  ビューバーのスワイプ判定、Daily表示ヘルパー、composeの送信先解決・ノート分割）。
  テストは`src/test/views.test.ts`
- `scripts/utils.js` - `escapeHtml` / `stripHtml`のみ（Jotflowy由来の自由記述編集系ヘルパーは不要なため削除済み）
- `styles/main.css` - スタイル（Charcoalテーマ=無彩色+期限切れ`#E39098`のみ。トークンは
  `design_handoff_taskflowy_views`のハンドオフ資料が正。基礎寸法は`design_handoff_workflowy_tasks`。
  フォントはBarlow / Barlow Condensed）

### Server Components (src/components/)
- `layouts/BaseLayout.tsx` - HTMLベーステンプレート（PWA設定、Google Fonts読み込み含む）
- `pages/MainPage.tsx` - メインUIのJSX（サーバーサイドレンダリング）。下部ビューバー、
  Tasksビュー（Today/Deadlines/Nodesの3タブ）、詳細シート・composeシート・全画面設定の骨格を持つ

## Key Concepts

- **認証**: APIキーはHTTP-only Cookieに暗号化して保存（Jotflowyと同方式。saltはアプリ固有）
- **ビュー**: 下部ビューバーで Tasks（組み込み）/ Daily（組み込み）/ 登録ノード（0個以上）を
  切り替える。切り替え操作はバー上のスワイプ（±44pxで隣へ1つ）とタップのみで、本文領域の
  スワイプは行操作に予約。ビューの実体は設定の「場所」リスト
- **場所（Place）**: ビュー兼書き込み先。`{id, kind: 'builtin'|'daily'|'node', name, ref, inView}`を
  LocalStorageに保存（`views.js`の`migratePlaces`が旧destinations設定から自動移行）。
  設定「場所」カードで並べ替え（=ビューバーの順）・表示ON/OFF・追加/削除。組み込みは削除不可、
  最後の表示中ビューは非表示にできない
- **タスク取得**: 検索APIが無いため`GET /nodes-export`（1req/min制限）を使用し、Worker側で
  `layoutMode: "todo"`のノードを抽出する。`/api/tasks`はNodesタブの進捗表示（done/total）のため
  完了済みも`completed`フラグ付きで返す。Cron通知は未完了のみ対象。クライアントは60秒TTLのキャッシュを持つ
- **Nodesタブのフィルタ**: TODOがすべて完了したノードはデフォルトで非表示。一覧右上のボタンで
  表示/非表示を切り替え、状態は`taskflowy_settings`の`showFinishedNodes`に保存する。
  判定は`filterFinishedNodes`（純粋関数）。TODOを1件も持たないノードは非表示の対象外
- **完了タスクの表示トグル**: Daily・登録ノードビュー・Nodesドリルダウンでは完了済みタスクを
  デフォルト非表示にし、一覧上部のボタンで表示/非表示を切り替える。状態は`taskflowy_settings`の
  `showCompletedTasks`に保存（全ビュー共通）。メモ（非タスク）は常に表示。純粋ロジックは
  `filterCompletedItems`/`visibleDailyGroups`（`views.js`）と`groupNodeTasks`の第2引数（`tasks.js`）
- **Dailyビュー**: `GET /api/daily`が日付キーのプローブ（`GET /nodes?parent_id=YYYY-MM-DD`、
  404=その日なし）で日付グループを返す。新しい日付が上、下方向へ無限スクロール
  （`before_date`でページング）。ノート0件の日は見出しごと出さない
- **登録ノードビュー**: `GET /api/nodes/:id/children`で子（1階層）をWorkflowyの並び順のまま表示。
  タスクとメモが混在し、タスクは本文下のTODO/DONEタグだけで示す（タグタップで完了トグル）
- **戻るボタン**: History APIと統合。レイヤー（シート/設定/ドリルダウン）を開くとき番兵の
  履歴エントリを1つ積み、popstateで最前面のレイヤーを1つ閉じる（残りがあれば積み直す）。
  閉じる順は`topUiLayer`（`views.js`の純粋関数）: 削除確認 > 送信先ピッカー > 詳細シート >
  composeシート > 設定 > ドリルダウン。UIの閉じるボタン/背景タップは`history.back()`に流して
  同期し、何も開いていないときの戻るだけがアプリを出る
- **行操作（全ビュー統一）**: 右スワイプ=完了トグル、左スワイプ=削除（確認シートを挟んで
  `DELETE /api/nodes/:id`）、行タップ=詳細シート（Pointer Eventsでマウスドラッグにも対応）。
  詳細シートはタスク/メモでレイアウトを分ける（メモは時刻·場所+note面の読み物レイアウト）。
  期限は詳細シートの「明日へ」またはシート内の期限行タップ（チップ+任意日時、`{date: null}`で解除）、
  メモはメモ行タップで編集（`POST /api/nodes/:id/note`）
- **期日**: ノード名内の`<time startYear=...>`マークアップが正。`/nodes/:id/schedule`が
  このマークアップを設定/置換する
- **compose**: FABから開くシート。タスク/ノートの2モード+送信先セレクタ（Daily 今日/明日/来週/
  任意日付、挿入位置 先頭/末尾、登録済みの場所、ノードツリー選択）。既定の送信先は表示中の
  ビューに対応する場所（Tasks/DailyビューはDaily 今日）。挿入位置は`taskflowy_settings`の
  `composePosition`に保存（既定は末尾）。送信後もシートは開いたまま入力だけ初期化される
  （連続追加。閉じるのは背景タップ、または空のまま追加）。タスク/ノートのモードは
  `composeMode`として保存され、次回開いたときに復元される。
  ノートは最初の空行でname/noteに分割（`splitNoteDraft`）。「書き込み先の日付」と「期限」は
  別概念で、日付を指定するUIをそれぞれ1か所に限定している
- **書き込み先**: `POST /api/send`。`targetType: "node" | "calendar"`。`calendar`は`day`キー
  （`today`/`tomorrow`/`next_week`/`YYYY-MM-DD`）を受け、Day NodeはWF側でオンデマンド作成。
  `position: "top" | "bottom"`（任意）で親ノード内の挿入位置を指定できる。
  クライアントは常にローカル日付を明示して送る（サーバーTZに依存しない）
- **通知**: 自前Web Push（VAPID）+ Cron Trigger（5分間隔、`wrangler.toml`の`[triggers]`）。
  時刻付きタスクは期日時刻を過ぎたら即時（1タスク=1通知）。朝`morningHour`
  （KV設定、デフォルト9）JSTのまとめ通知は「その日が期日のタスク」+「期日を過ぎても
  未完了のタスク（期限切れセクション。キーが`overdue:<今日>:<taskId>`のため、完了/期限変更
  されるまで毎朝繰り返す）」を1通知に束ねる。期限切れのみでも発火する。時刻付きタスクの
  個別通知だけは、期日から24時間より古い分を初回導入時の通知バーストを避けるため送信せず
  「通知済み」として記録する（まとめ通知側には出る）。判定ロジックは
  `selectDueNotifications`（純粋関数、`src/test/notify.test.ts`にテストあり）

## Environment Variables (wrangler.toml)

- `ENCRYPTION_KEY` - APIキー暗号化用キー
- `ALLOWED_ORIGINS` - CORS許可オリジン（カンマ区切り）
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` - Web Push用VAPID鍵
  （secretとして設定。`npm run generate-vapid-keys`で生成）

## KV Namespace

- `KV` - 通知機能用データを保存。スキーマは`src/api/kv-store.ts`のコメントを参照
  （Push購読リスト、通知済み記録、通知設定、暗号化APIキーのミラー）
