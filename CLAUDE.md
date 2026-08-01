# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TaskflowyはWorkflowy公式APIを利用したタスク管理PWA。Cloudflare Workers上で動作し、
フロントエンドにHono JSXを使用。Jotflowy（ノートアプリ）のタスクビュー機能を分離・
再構成したプロジェクトで、設計上の経緯は[DESIGN.md](./DESIGN.md)を参照。

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
- `scripts/utils.js` - `escapeHtml` / `stripHtml`のみ（Jotflowy由来の自由記述編集系ヘルパーは不要なため削除済み）
- `styles/main.css` - スタイル（Catppuccin Macchiatoテーマ。トークンは`design_handoff_workflowy_tasks`の
  ハンドオフ資料が正。フォントはBarlow / Barlow Condensed）

### Server Components (src/components/)
- `layouts/BaseLayout.tsx` - HTMLベーステンプレート（PWA設定、Google Fonts読み込み含む）
- `pages/MainPage.tsx` - メインUIのJSX（サーバーサイドレンダリング）。Today/Deadlines/Nodesの3タブ、
  詳細シート・追加シート・全画面設定の骨格を持つ

## Key Concepts

- **認証**: APIキーはHTTP-only Cookieに暗号化して保存（Jotflowyと同方式。saltはアプリ固有）
- **タスク取得**: 検索APIが無いため`GET /nodes-export`（1req/min制限）を使用し、Worker側で
  `layoutMode: "todo"`のノードを抽出する。`/api/tasks`はNodesタブの進捗表示（done/total）のため
  完了済みも`completed`フラグ付きで返す。Cron通知は未完了のみ対象。クライアントは60秒TTLのキャッシュを持つ
- **Nodesタブのフィルタ**: TODOがすべて完了したノードはデフォルトで非表示。一覧右上のボタンで
  表示/非表示を切り替え、状態は`taskflowy_settings`の`showFinishedNodes`に保存する。
  判定は`filterFinishedNodes`（純粋関数）。TODOを1件も持たないノードは非表示の対象外
- **タスク操作**: 行の右スワイプ=完了トグル、左スワイプ=削除（確認シートを挟んで
  `DELETE /api/nodes/:id`）、
  行タップ=詳細シート（Pointer Eventsでマウスドラッグにも対応）。期限は詳細シートの
  「明日へ/来週へ」またはシート内の期限行タップ（チップ+任意日時、`{date: null}`で解除）、
  メモはメモ行タップで編集（`POST /api/nodes/:id/note`）。追加シートはチップに加えて
  任意の日付/時刻を指定可能
- **期日**: ノード名内の`<time startYear=...>`マークアップが正。`/nodes/:id/schedule`が
  このマークアップを設定/置換する
- **Destination**: `type: "node" | "calendar"`。タスクの追加先。`calendar`は
  Workflowyネイティブカレンダー（`parent_id="today"`で送信、Day NodeはWF側でオンデマンド作成）
- **通知**: 自前Web Push（VAPID）+ Cron Trigger（5分間隔、`wrangler.toml`の`[triggers]`）。
  時刻付きタスクは期日時刻を過ぎたら即時（1タスク=1通知）、日付のみのタスクは
  朝`morningHour`（KV設定、デフォルト9）JSTにその日が期日のタスクをまとめて1通知。
  過去24時間より前に期日を迎えた分は初回導入時の大量通知を避けるため送信せず
  「通知済み」として記録するのみ。判定ロジックは`selectDueNotifications`（純粋関数、
  `src/test/notify.test.ts`にテストあり）

## Environment Variables (wrangler.toml)

- `ENCRYPTION_KEY` - APIキー暗号化用キー
- `ALLOWED_ORIGINS` - CORS許可オリジン（カンマ区切り）
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` - Web Push用VAPID鍵
  （secretとして設定。`npm run generate-vapid-keys`で生成）

## KV Namespace

- `KV` - 通知機能用データを保存。スキーマは`src/api/kv-store.ts`のコメントを参照
  （Push購読リスト、通知済み記録、通知設定、暗号化APIキーのミラー）
