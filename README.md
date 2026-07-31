# Taskflowy

Workflowy公式APIを使ったタスク管理PWA。Workflowy上のTODOアイテム（`layoutMode: "todo"`が
設定された未完了ノード）を一覧・完了・期日設定できる。

Cloudflare Workers上で動作し、フロントエンドはHono JSXによるサーバーサイドレンダリング +
バニラJSクライアント。

## 主な機能

- タスク一覧: 期日 / 親ノード / 作成日でグルーピング切替
- スワイプ操作: 右スワイプで完了、左スワイプで期日設定シートを開く
- 完了のUndo: 完了直後に取り消せるトースト表示
- 新規タスク追加: 送信先（ノード or Workflowyネイティブカレンダー）を選んでTODOを作成
- 期日設定: Workflowyのネイティブ`<time>`マークアップと同じ形式で期日を保存するため、
  Workflowy本体・モバイルアプリと表示が一致する
- PWA対応: ホーム画面追加、Service Workerによるオフライン時の静的アセット提供
- リマインダー通知: 自前のWeb Push（VAPID）+ Cron Trigger（5分間隔）で、期日が来た
  タスクをプッシュ通知する。時刻付きタスクはその日時、日付のみのタスクは朝9時JST
  （設定変更可）にまとめて通知

タスク一覧の取得元や期日の扱い、通知機能の設計判断については [DESIGN.md](./DESIGN.md) を参照。

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars   # ENCRYPTION_KEY, ALLOWED_ORIGINSを設定
npm run dev
```

`wrangler.toml`の`kv_namespaces`はプレースホルダーのIDになっているため、実際に
デプロイする場合は `wrangler kv namespace create <name>` で作成したIDに差し替えること。

### 通知機能（Web Push）を有効にする

1. VAPID鍵ペアを生成する:

   ```bash
   npm run generate-vapid-keys
   ```

   出力される `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` を控える。

2. ローカル開発時は `.dev.vars` に追記する:

   ```
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:you@example.com
   ```

3. 本番デプロイ時は Worker secret として設定する:

   ```bash
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT
   ```

4. KV namespaceを作成し、`wrangler.toml`の`id`を差し替える（未実施の場合）:

   ```bash
   npx wrangler kv namespace create KV
   ```

`[triggers]`の`crons`は`wrangler.toml`に設定済みで、`wrangler deploy`時に自動的に
登録される。

## コマンド

```bash
npm run dev                  # 開発サーバー起動 (wrangler dev)
npm run deploy                # Cloudflare Workersへデプロイ
npm run typecheck             # TypeScript型チェック
npm test                      # vitestでテスト実行（watchモード）
npm run test:run              # テストを1回実行
npm run generate-vapid-keys   # VAPID鍵ペアを生成
```

## 関連プロジェクト

[Jotflowy](https://github.com/chroju/jotflowy) — Workflowy公式APIを使った
ノートアプリ。Taskflowyはこのプロジェクトのタスクビュー機能を分離・再構成したもの。
