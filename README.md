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

タスク一覧の取得元や期日の扱い、今後実装予定の通知機能については
[DESIGN.md](./DESIGN.md) を参照。

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars   # ENCRYPTION_KEY, ALLOWED_ORIGINSを設定
npm run dev
```

`wrangler.toml`の`kv_namespaces`はプレースホルダーのIDになっているため、実際に
デプロイする場合は `wrangler kv namespace create <name>` で作成したIDに差し替えること。

## コマンド

```bash
npm run dev        # 開発サーバー起動 (wrangler dev)
npm run deploy     # Cloudflare Workersへデプロイ
npm run typecheck  # TypeScript型チェック
npm test           # vitestでテスト実行（watchモード）
npm run test:run   # テストを1回実行
```

## 関連プロジェクト

[Jotflowy](https://github.com/chroju/jotflowy) — Workflowy公式APIを使った
ノートアプリ。Taskflowyはこのプロジェクトのタスクビュー機能を分離・再構成したもの。
