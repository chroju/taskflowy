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
- `index.tsx` - Honoアプリケーションのエントリーポイント。ルーティング定義
- `api/handlers.ts` - APIエンドポイント実装。認証、タスク操作、送信先ノード一覧など
- `api/workflowy-v1.ts` - Workflowy API v1クライアント
- `api/crypto.ts` - APIキーの暗号化/復号化
- `api/tasks.ts` - `nodes-export`のフラットなノード配列からタスク（未完了・layoutMode=todo）を抽出
- `api/time-markup.ts` - ノード名に埋め込む`<time>`マークアップのパース/生成
- `types/index.ts` - 共有型定義

### Frontend (public/)
- `scripts/client.js` - UIロジック（DOM操作、イベントバインド）。LocalStorageで設定保存、APIとの通信
- `scripts/tasks.js` - タスク一覧の純粋ロジック（グルーピング・日付フォーマット・スワイプ判定など）。DOM非依存でユニットテスト可能
- `scripts/utils.js` - `escapeHtml` / `stripHtml`のみ（Jotflowy由来の自由記述編集系ヘルパーは不要なため削除済み）
- `styles/main.css` - スタイル（night ink potテーマ、Jotflowyと共通のCSS変数を使用）

### Server Components (src/components/)
- `layouts/BaseLayout.tsx` - HTMLベーステンプレート（PWA設定含む）
- `pages/MainPage.tsx` - メインUIのJSX（サーバーサイドレンダリング）。タブなしの単独タスク画面

## Key Concepts

- **認証**: APIキーはHTTP-only Cookieに暗号化して保存（Jotflowyと同方式。saltはアプリ固有）
- **タスク取得**: 検索APIが無いため`GET /nodes-export`（1req/min制限）を使用し、Worker側で
  `layoutMode: "todo"`かつ未完了のノードを抽出する。クライアントは60秒TTLのキャッシュを持つ
- **期日**: ノード名内の`<time startYear=...>`マークアップが正。`/nodes/:id/schedule`が
  このマークアップを設定/置換する
- **Destination**: `type: "node" | "calendar"`。タスクの追加先。`calendar`は
  Workflowyネイティブカレンダー（`parent_id="today"`で送信、Day NodeはWF側でオンデマンド作成）
- **通知**: 未実装（次フェーズ）。KVバインディング（`env.KV`）はこのために予約済み

## Environment Variables (wrangler.toml)

- `ENCRYPTION_KEY` - APIキー暗号化用キー
- `ALLOWED_ORIGINS` - CORS許可オリジン（カンマ区切り）

## KV Namespace

- `KV` - 通知機能（次フェーズ）用。現時点のコードでは未使用
